package expo.modules.ezrawakeword

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Handler
import android.os.HandlerThread
import android.os.Build
import android.provider.MediaStore
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

internal object EzraScreenCapture {
  fun captureToGallery(context: Context, resultCode: Int, resultData: Intent): String {
    val manager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    val projection = manager.getMediaProjection(resultCode, resultData)
      ?: throw IllegalStateException("Android did not grant screen capture.")

    val metrics = context.resources.displayMetrics
    val width = metrics.widthPixels
    val height = metrics.heightPixels
    val densityDpi = metrics.densityDpi
    if (width <= 0 || height <= 0) {
      projection.stop()
      throw IllegalStateException("Screen dimensions are unavailable.")
    }

    val thread = HandlerThread("EZRA-ScreenCapture").apply { start() }
    val handler = Handler(thread.looper)
    val reader = ImageReader.newInstance(width, height, android.graphics.PixelFormat.RGBA_8888, 2)
    val imageReference = AtomicReference<Image?>(null)
    val imageReady = CountDownLatch(1)
    reader.setOnImageAvailableListener({ source ->
      val image = source.acquireLatestImage()
      if (image != null && imageReference.compareAndSet(null, image)) {
        imageReady.countDown()
      } else {
        image?.close()
      }
    }, handler)

    var display: VirtualDisplay? = null
    val callback = object : MediaProjection.Callback() {
      override fun onStop() {
        imageReady.countDown()
      }
    }

    try {
      projection.registerCallback(callback, handler)
      display = projection.createVirtualDisplay(
        "EZRA-ScreenCapture",
        width,
        height,
        densityDpi,
        DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
        reader.surface,
        null,
        handler
      ) ?: throw IllegalStateException("Android could not create the screen capture display.")

      if (!imageReady.await(6, TimeUnit.SECONDS)) {
        throw IllegalStateException("Timed out while capturing the screen.")
      }
      val image = imageReference.get()
        ?: throw IllegalStateException("Android did not provide a screen image.")
      val plane = image.planes.firstOrNull()
        ?: throw IllegalStateException("The screen image is empty.")
      val pixelStride = plane.pixelStride
      val rowStride = plane.rowStride
      val rowPadding = rowStride - pixelStride * width
      val paddedWidth = width + (rowPadding / pixelStride)
      val paddedBitmap = Bitmap.createBitmap(paddedWidth, height, Bitmap.Config.ARGB_8888)
      paddedBitmap.copyPixelsFromBuffer(plane.buffer)
      image.close()
      imageReference.set(null)
      val bitmap = Bitmap.createBitmap(paddedBitmap, 0, 0, width, height)
      paddedBitmap.recycle()

      val values = ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME, "EZRA_${System.currentTimeMillis()}.png")
        put(MediaStore.Images.Media.MIME_TYPE, "image/png")
        if (Build.VERSION.SDK_INT >= 29) {
          put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/EZRA")
          put(MediaStore.Images.Media.IS_PENDING, 1)
        }
      }
      val uri = context.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
        ?: throw IllegalStateException("Could not create the screenshot file.")
      try {
        val output = context.contentResolver.openOutputStream(uri)
          ?: throw IllegalStateException("Could not open the screenshot file.")
        output.use { stream ->
          if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)) {
            throw IllegalStateException("Could not write the screenshot.")
          }
        }
        if (Build.VERSION.SDK_INT >= 29) {
          context.contentResolver.update(
            uri,
            ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) },
            null,
            null
          )
        }
      } catch (error: Exception) {
        context.contentResolver.delete(uri, null, null)
        throw error
      } finally {
        bitmap.recycle()
      }
      return uri.toString()
    } finally {
      imageReference.getAndSet(null)?.close()
      display?.release()
      reader.close()
      projection.stop()
      thread.quitSafely()
    }
  }
}
