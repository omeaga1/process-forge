using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace ProcessForge
{
    static class Program
    {
        private const int DefaultPort = 42421;
        private static HttpListener _listener;
        private static string _appDir;

        [STAThread]
        static void Main(string[] args)
        {
            const string MutexName = "ProcessForge_SingleInstance_Mutex";
            bool isNewInstance;
            using (var mutex = new Mutex(true, MutexName, out isNewInstance))
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                _appDir = Path.Combine(baseDir, "app");
                if (!Directory.Exists(_appDir))
                {
                    _appDir = baseDir;
                }

                string url = "http://127.0.0.1:" + DefaultPort + "/";

                if (!isNewInstance)
                {
                    // Existing server is already running; open browser app window and exit
                    OpenBrowser(url);
                    return;
                }

                // First instance: start the local micro-server
                try
                {
                    _listener = new HttpListener();
                    _listener.Prefixes.Add(url);
                    _listener.Start();

                    var listenThread = new Thread(ListenLoop)
                    {
                        IsBackground = true
                    };
                    listenThread.Start();
                }
                catch (Exception)
                {
                    // Port might already be bound by previous process
                }

                // Open the desktop app window
                OpenBrowser(url);

                // Keep server alive in background
                while (true)
                {
                    Thread.Sleep(30000);
                }
            }
        }

        private static void OpenBrowser(string url)
        {
            string browserPath = FindBrowser();
            if (!string.IsNullOrEmpty(browserPath))
            {
                try
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = browserPath,
                        Arguments = "--app=\"" + url + "\" --no-first-run --no-default-browser-check",
                        UseShellExecute = false
                    });
                    return;
                }
                catch { }
            }

            // Fallback to default browser
            try
            {
                Process.Start(url);
            }
            catch { }
        }

        private static string FindBrowser()
        {
            string[] searchPaths = new string[]
            {
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86) + @"\Microsoft\Edge\Application\msedge.exe",
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles) + @"\Microsoft\Edge\Application\msedge.exe",
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) + @"\Microsoft\Edge\Application\msedge.exe",
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles) + @"\Google\Chrome\Application\chrome.exe",
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86) + @"\Google\Chrome\Application\chrome.exe"
            };

            foreach (var path in searchPaths)
            {
                if (File.Exists(path))
                {
                    return path;
                }
            }
            return null;
        }

        private static void ListenLoop()
        {
            while (_listener != null && _listener.IsListening)
            {
                try
                {
                    var context = _listener.GetContext();
                    ThreadPool.QueueUserWorkItem((state) => HandleRequest((HttpListenerContext)state), context);
                }
                catch { }
            }
        }

        private static void HandleRequest(HttpListenerContext context)
        {
            try
            {
                string rawUrl = context.Request.Url.AbsolutePath;

                if (rawUrl.Equals("/api/heartbeat", StringComparison.OrdinalIgnoreCase))
                {
                    byte[] pong = Encoding.UTF8.GetBytes("{\"status\":\"alive\"}");
                    context.Response.ContentType = "application/json";
                    context.Response.ContentLength64 = pong.Length;
                    context.Response.AddHeader("Access-Control-Allow-Origin", "*");
                    context.Response.OutputStream.Write(pong, 0, pong.Length);
                    return;
                }

                if (string.IsNullOrEmpty(rawUrl) || rawUrl == "/")
                {
                    rawUrl = "/index.html";
                }

                string relativePath = rawUrl.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
                string filePath = Path.Combine(_appDir, relativePath);

                if (!File.Exists(filePath))
                {
                    filePath = Path.Combine(_appDir, "index.html");
                }

                if (File.Exists(filePath))
                {
                    byte[] data = File.ReadAllBytes(filePath);
                    string ext = Path.GetExtension(filePath).ToLowerInvariant();
                    string mime = GetMimeType(ext);

                    context.Response.ContentType = mime;
                    context.Response.ContentLength64 = data.Length;
                    context.Response.AddHeader("Access-Control-Allow-Origin", "*");
                    context.Response.AddHeader("Cache-Control", "no-cache, no-store, must-revalidate");
                    context.Response.OutputStream.Write(data, 0, data.Length);
                }
                else
                {
                    context.Response.StatusCode = 404;
                }
            }
            catch
            {
                try { context.Response.StatusCode = 500; } catch { }
            }
            finally
            {
                try { context.Response.OutputStream.Close(); } catch { }
            }
        }

        private static string GetMimeType(string ext)
        {
            switch (ext)
            {
                case ".html": return "text/html; charset=utf-8";
                case ".js":
                case ".mjs": return "text/javascript; charset=utf-8";
                case ".css": return "text/css; charset=utf-8";
                case ".json": return "application/json; charset=utf-8";
                case ".svg": return "image/svg+xml";
                case ".png": return "image/png";
                case ".jpg":
                case ".jpeg": return "image/jpeg";
                case ".ico": return "image/x-icon";
                case ".wasm": return "application/wasm";
                case ".woff": return "font/woff";
                case ".woff2": return "font/woff2";
                case ".ttf": return "font/ttf";
                default: return "application/octet-stream";
            }
        }
    }
}
