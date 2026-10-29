package com.gymcam.app

import android.content.Intent
import android.graphics.Bitmap
import android.os.Bundle
import android.util.LruCache
import android.util.Size
import android.view.View
import android.view.ViewGroup
import android.widget.BaseAdapter
import android.widget.GridView
import android.widget.ImageView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import java.util.concurrent.Executors

/** Grid of everything GymCam saved to DCIM/GymCam, newest first. */
class LibraryActivity : ComponentActivity() {

    private val loader = Executors.newFixedThreadPool(3)
    private val cache = object : LruCache<Long, Bitmap>(24 * 1024 * 1024) {
        override fun sizeOf(key: Long, value: Bitmap) = value.byteCount
    }
    private var items: List<MediaItem> = emptyList()
    private lateinit var grid: GridView
    private lateinit var tvEmpty: TextView
    private lateinit var tvCount: TextView

    private class Holder(val thumb: ImageView, val badge: View, val duration: TextView) {
        var boundId = -1L
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_library)
        grid = findViewById(R.id.grid)
        tvEmpty = findViewById(R.id.tvEmpty)
        tvCount = findViewById(R.id.tvCount)
        val header = findViewById<View>(R.id.header)
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.root)) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            header.updatePadding(top = bars.top + dp(8))
            grid.updatePadding(top = bars.top + dp(84), bottom = bars.bottom + dp(8))
            insets
        }
        findViewById<View>(R.id.btnBack).setOnClickListener { finish() }
        grid.adapter = adapter
        grid.setOnItemClickListener { _, _, pos, _ ->
            val item = items[pos]
            startActivity(
                Intent(this, ViewerActivity::class.java)
                    .putExtra(ViewerActivity.EXTRA_URI, item.uri.toString())
                    .putExtra(ViewerActivity.EXTRA_VIDEO, item.isVideo)
            )
        }
    }

    override fun onResume() {
        super.onResume()
        loader.execute {
            val list = GymMedia.query(this)
            runOnUiThread {
                items = list
                adapter.notifyDataSetChanged()
                tvEmpty.visibility = if (list.isEmpty()) View.VISIBLE else View.GONE
                val videos = list.count { it.isVideo }
                tvCount.text = "$videos videos · ${list.size - videos} photos"
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        loader.shutdownNow()
    }

    private val adapter = object : BaseAdapter() {
        override fun getCount() = items.size
        override fun getItem(position: Int) = items[position]
        override fun getItemId(position: Int) = items[position].id

        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val view = convertView ?: layoutInflater.inflate(R.layout.item_media, parent, false).also {
                it.tag = Holder(it.findViewById(R.id.thumb), it.findViewById(R.id.videoBadge), it.findViewById(R.id.tvDuration))
                it.clipToOutline = true
            }
            val h = view.tag as Holder
            val item = items[position]
            h.boundId = item.id
            h.badge.visibility = if (item.isVideo) View.VISIBLE else View.GONE
            h.duration.text = formatDuration(item.durationMs)
            val cached = cache.get(item.id)
            h.thumb.setImageBitmap(cached)
            if (cached == null) {
                loader.execute {
                    val bmp = runCatching {
                        contentResolver.loadThumbnail(item.uri, Size(360, 360), null)
                    }.getOrNull() ?: return@execute
                    cache.put(item.id, bmp)
                    runOnUiThread { if (h.boundId == item.id) h.thumb.setImageBitmap(bmp) }
                }
            }
            return view
        }
    }
}
