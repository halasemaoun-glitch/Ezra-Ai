package expo.modules.ezradocumentocr

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import dev.ffmpegkit.tesseract.TesseractConfig
import dev.ffmpegkit.tesseract.TesseractOCR
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.max
import kotlin.math.min

class EzraDocumentOcrModule : Module() {
  companion object {
    private const val ARABIC_TESSDATA_URL =
      "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd/ara.traineddata"
    private const val MIN_TESSDATA_BYTES = 500_000L
    private const val MAX_TESSDATA_BYTES = 20_000_000L
  }

  override fun definition() = ModuleDefinition {
    Name("EzraDocumentOcr")

    AsyncFunction("extractPdfText") { uriString: String, requestedMaxPages: Int, requestedMaxOutputChars: Int ->
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("Android application context is unavailable")
      val maxPages = requestedMaxPages.coerceIn(1, 300)
      val maxOutputChars = requestedMaxOutputChars.coerceIn(10_000, 4 * 1024 * 1024)

      runBlocking(Dispatchers.IO) {
        val tessdataDir = File(context.filesDir, "tesseract/tessdata")
        if (!tessdataDir.exists() && !tessdataDir.mkdirs()) {
          throw IllegalStateException("Could not create the private OCR model directory.")
        }
        ensureArabicModel(tessdataDir)

        val ocr = TesseractOCR()
        try {
          ocr.initialize(
            context,
            language = "ara+eng",
            config = TesseractConfig(pageSegMode = 3, ocrEngineMode = 3)
          )

          val descriptor = openPdfDescriptor(context, uriString)
          try {
            val renderer = PdfRenderer(descriptor)
            try {
              val totalPages = renderer.pageCount
              if (totalPages <= 0) throw IllegalArgumentException("PDF contains no pages.")
              val pagesToProcess = min(totalPages, maxPages)
              val output = StringBuilder()
              var pagesProcessed = 0
              var outputLimitReached = false

              for (pageIndex in 0 until pagesToProcess) {
                if (output.length >= maxOutputChars) {
                  outputLimitReached = true
                  break
                }

                val page = renderer.openPage(pageIndex)
                try {
                  val longestSide = max(page.width, page.height).toFloat()
                  val scale = min(2.4f, 2200f / longestSide)
                  val bitmapWidth = max(1, (page.width * scale).toInt())
                  val bitmapHeight = max(1, (page.height * scale).toInt())
                  val bitmap = Bitmap.createBitmap(bitmapWidth, bitmapHeight, Bitmap.Config.ARGB_8888)
                  try {
                    bitmap.eraseColor(Color.WHITE)
                    val transform = Matrix().apply { setScale(scale, scale) }
                    page.render(bitmap, null, transform, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    val recognized = ocr.recognize(bitmap).text.trim()
                    if (recognized.isNotEmpty()) {
                      if (output.isNotEmpty()) output.append("\n\n")
                      val remaining = maxOutputChars - output.length
                      if (recognized.length > remaining) {
                        output.append(recognized.substring(0, remaining))
                        outputLimitReached = true
                      } else {
                        output.append(recognized)
                      }
                    }
                  } finally {
                    bitmap.recycle()
                  }
                } finally {
                  page.close()
                }
                pagesProcessed += 1
                if (outputLimitReached) break
              }

              mapOf(
                "text" to output.toString().trim(),
                "pagesProcessed" to pagesProcessed,
                "totalPages" to totalPages,
                "truncated" to (pagesProcessed < totalPages || outputLimitReached)
              )
            } finally {
              renderer.close()
            }
          } finally {
            descriptor.close()
          }
        } finally {
          ocr.release()
        }
      }
    }
  }

  private fun openPdfDescriptor(context: Context, uriString: String): ParcelFileDescriptor {
    val uri = Uri.parse(uriString)
    return when (uri.scheme) {
      "content" -> context.contentResolver.openFileDescriptor(uri, "r")
        ?: throw IllegalArgumentException("Android could not open the selected PDF.")
      "file" -> ParcelFileDescriptor.open(
        File(uri.path ?: throw IllegalArgumentException("PDF path is empty.")),
        ParcelFileDescriptor.MODE_READ_ONLY
      )
      else -> ParcelFileDescriptor.open(File(uriString), ParcelFileDescriptor.MODE_READ_ONLY)
    }
  }

  private fun ensureArabicModel(tessdataDir: File) {
    val target = File(tessdataDir, "ara.traineddata")
    if (target.isFile && target.length() in MIN_TESSDATA_BYTES..MAX_TESSDATA_BYTES) return

    val temporary = File(tessdataDir, "ara.traineddata.download")
    temporary.delete()
    val connection = (URL(ARABIC_TESSDATA_URL).openConnection() as HttpURLConnection).apply {
      requestMethod = "GET"
      connectTimeout = 20_000
      readTimeout = 45_000
      instanceFollowRedirects = true
      setRequestProperty("User-Agent", "EZRA-Android-OCR/1.0")
    }

    try {
      connection.connect()
      val status = connection.responseCode
      if (status !in 200..299) {
        throw IllegalStateException("Could not download the Arabic OCR model (HTTP $status). Connect to the internet and retry.")
      }
      val expectedBytes = connection.contentLengthLong
      if (expectedBytes > MAX_TESSDATA_BYTES) {
        throw IllegalStateException("The Arabic OCR model download is unexpectedly large.")
      }
      connection.inputStream.use { input ->
        temporary.outputStream().use { output -> input.copyTo(output) }
      }
      if (temporary.length() !in MIN_TESSDATA_BYTES..MAX_TESSDATA_BYTES) {
        temporary.delete()
        throw IllegalStateException("The Arabic OCR model download is incomplete. Connect to the internet and retry.")
      }
      if (target.exists() && !target.delete()) {
        throw IllegalStateException("Could not replace the incomplete Arabic OCR model.")
      }
      if (!temporary.renameTo(target)) {
        temporary.delete()
        throw IllegalStateException("Could not save the Arabic OCR model.")
      }
    } finally {
      connection.disconnect()
    }
  }
}
