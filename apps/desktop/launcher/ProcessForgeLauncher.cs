using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
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

                if (rawUrl.Equals("/api/status", StringComparison.OrdinalIgnoreCase))
                {
                    string statusJson = "{\"status\":\"running\",\"version\":\"0.1.2\",\"isDesktop\":true,\"appDir\":\"" + _appDir.Replace("\\", "\\\\") + "\"}";
                    byte[] statusBytes = Encoding.UTF8.GetBytes(statusJson);
                    context.Response.ContentType = "application/json";
                    context.Response.ContentLength64 = statusBytes.Length;
                    context.Response.AddHeader("Access-Control-Allow-Origin", "*");
                    context.Response.OutputStream.Write(statusBytes, 0, statusBytes.Length);
                    return;
                }

                if (rawUrl.Equals("/api/pull-update", StringComparison.OrdinalIgnoreCase))
                {
                    HandlePullUpdate(context);
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
                case ".woff2": return "font/woff2";
                case ".ttf": return "font/ttf";
                default: return "application/octet-stream";
            }
        }

        private static void HandlePullUpdate(HttpListenerContext context)
        {
            try
            {
                ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072 | SecurityProtocolType.Tls;
                string tempZip = Path.Combine(Path.GetTempPath(), "pf-update-" + Guid.NewGuid().ToString("N") + ".zip");
                string tempExtract = Path.Combine(Path.GetTempPath(), "pf-update-" + Guid.NewGuid().ToString("N"));

                string[] downloadCandidates = new string[]
                {
                    "https://github.com/omeaga1/process-forge/releases/latest/download/process-forge-windows-portable-x64.zip",
                    "https://github.com/omeaga1/process-forge/releases/download/v0.1.2/process-forge-windows-portable-x64.zip",
                    "https://github.com/omeaga1/process-forge/releases/download/v0.1.1/process-forge-windows-portable-x64.zip",
                    "https://raw.githubusercontent.com/omeaga1/process-forge/main/release-dist/process-forge-windows-portable-x64.zip"
                };

                bool downloaded = false;
                using (var client = new WebClient())
                {
                    client.Headers["User-Agent"] = "ProcessForge-Desktop-Launcher";
                    foreach (var url in downloadCandidates)
                    {
                        try
                        {
                            client.DownloadFile(url, tempZip);
                            if (File.Exists(tempZip) && new FileInfo(tempZip).Length > 1000)
                            {
                                downloaded = true;
                                break;
                            }
                        }
                        catch { }
                    }
                }

                if (!downloaded)
                {
                    byte[] errBytes = Encoding.UTF8.GetBytes("{\"status\":\"error\",\"message\":\"Failed to download update bundle from release mirrors.\"}");
                    context.Response.StatusCode = 502;
                    context.Response.ContentType = "application/json";
                    context.Response.AddHeader("Access-Control-Allow-Origin", "*");
                    context.Response.OutputStream.Write(errBytes, 0, errBytes.Length);
                    return;
                }

                ZipFile.ExtractToDirectory(tempZip, tempExtract);

                string sourceAppDir = Path.Combine(tempExtract, "process-forge-windows-portable", "app");
                if (!Directory.Exists(sourceAppDir))
                {
                    sourceAppDir = Path.Combine(tempExtract, "app");
                }

                if (Directory.Exists(sourceAppDir))
                {
                    if (!Directory.Exists(_appDir))
                    {
                        Directory.CreateDirectory(_appDir);
                    }
                    CopyDirectory(sourceAppDir, _appDir);
                }

                try { File.Delete(tempZip); } catch { }
                try { Directory.Delete(tempExtract, true); } catch { }

                byte[] okBytes = Encoding.UTF8.GetBytes("{\"status\":\"success\",\"message\":\"Update pulled and applied successfully. Reloading interface.\"}");
                context.Response.ContentType = "application/json";
                context.Response.AddHeader("Access-Control-Allow-Origin", "*");
                context.Response.OutputStream.Write(okBytes, 0, okBytes.Length);
            }
            catch (Exception ex)
            {
                try
                {
                    byte[] errBytes = Encoding.UTF8.GetBytes("{\"status\":\"error\",\"message\":\"" + ex.Message.Replace("\"", "\\\"") + "\"}");
                    context.Response.StatusCode = 500;
                    context.Response.ContentType = "application/json";
                    context.Response.AddHeader("Access-Control-Allow-Origin", "*");
                    context.Response.OutputStream.Write(errBytes, 0, errBytes.Length);
                }
                catch { }
            }
        }

        private static void CopyDirectory(string sourceDir, string destDir)
        {
            Directory.CreateDirectory(destDir);
            foreach (string file in Directory.GetFiles(sourceDir))
            {
                string destFile = Path.Combine(destDir, Path.GetFileName(file));
                File.Copy(file, destFile, true);
            }
            foreach (string subDir in Directory.GetDirectories(sourceDir))
            {
                string destSub = Path.Combine(destDir, Path.GetFileName(subDir));
                CopyDirectory(subDir, destSub);
            }
        }
    }
}
