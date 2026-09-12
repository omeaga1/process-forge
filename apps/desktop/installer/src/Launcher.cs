using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

namespace ProcessForge
{
    static class Launcher
    {
        private static HttpListener listener;
        private static string appDir;
        private static volatile bool isRunning = true;
        private static DateTime lastActivity = DateTime.Now;

        [STAThread]
        static void Main()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string htmlPath = Path.Combine(baseDir, "app", "index.html");

                if (!File.Exists(htmlPath))
                {
                    string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                    string altPath = Path.Combine(localAppData, "ProcessForge", "app", "index.html");
                    if (File.Exists(altPath))
                    {
                        htmlPath = altPath;
                        baseDir = Path.Combine(localAppData, "ProcessForge");
                    }
                }

                if (!File.Exists(htmlPath))
                {
                    MessageBox.Show(
                        "ProcessForge application assets could not be located at:\n" + htmlPath +
                        "\n\nPlease reinstall ProcessForge.",
                        "ProcessForge — Missing Assets",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return;
                }

                appDir = Path.Combine(baseDir, "app");

                // Find a free TCP port on localhost
                int port = GetFreeTcpPort();
                string serverUrl = string.Format("http://127.0.0.1:{0}/", port);

                // Start lightweight embedded localhost static file server
                listener = new HttpListener();
                listener.Prefixes.Add(serverUrl);
                listener.Start();

                Thread serverThread = new Thread(ListenLoop);
                serverThread.IsBackground = true;
                serverThread.Start();

                // Look for Microsoft Edge (installed on 100% of Windows 10/11)
                string edgePath = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
                if (!File.Exists(edgePath))
                {
                    edgePath = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe";
                }

                string profileDir = Path.Combine(baseDir, "EdgeProfile");
                Process proc = null;

                if (File.Exists(edgePath))
                {
                    // Using --user-data-dir gives an isolated app profile and prevents msedge.exe from immediately exiting
                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = edgePath,
                        Arguments = string.Format("--app=\"{0}\" --user-data-dir=\"{1}\" --window-size=1440,900 --no-first-run", serverUrl, profileDir),
                        UseShellExecute = false
                    };
                    proc = Process.Start(psi);
                }
                else
                {
                    proc = Process.Start(new ProcessStartInfo
                    {
                        FileName = serverUrl,
                        UseShellExecute = true
                    });
                }

                // Keep local HTTP server alive while window process is running
                while (isRunning)
                {
                    if (proc != null && proc.HasExited)
                    {
                        break;
                    }
                    if ((DateTime.Now - lastActivity).TotalMinutes > 60)
                    {
                        break;
                    }
                    Thread.Sleep(500);
                }

                isRunning = false;
                try { listener.Stop(); } catch { }
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Error launching ProcessForge:\n" + ex.Message,
                    "ProcessForge Launch Failure",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }

        private static int GetFreeTcpPort()
        {
            TcpListener l = new TcpListener(IPAddress.Loopback, 0);
            l.Start();
            int port = ((IPEndPoint)l.LocalEndpoint).Port;
            l.Stop();
            return port;
        }

        private static void ListenLoop()
        {
            while (isRunning)
            {
                try
                {
                    HttpListenerContext context = listener.GetContext();
                    lastActivity = DateTime.Now;
                    ThreadPool.QueueUserWorkItem(ProcessRequest, context);
                }
                catch
                {
                    if (!isRunning) break;
                }
            }
        }

        private static void ProcessRequest(object state)
        {
            HttpListenerContext context = (HttpListenerContext)state;
            try
            {
                lastActivity = DateTime.Now;
                string rawUrl = context.Request.Url.AbsolutePath.TrimStart('/');
                if (string.IsNullOrEmpty(rawUrl)) rawUrl = "index.html";

                rawUrl = rawUrl.Replace('/', Path.DirectorySeparatorChar);
                string filePath = Path.GetFullPath(Path.Combine(appDir, rawUrl));

                if (!filePath.StartsWith(appDir, StringComparison.OrdinalIgnoreCase) || !File.Exists(filePath))
                {
                    filePath = Path.Combine(appDir, "index.html");
                }

                byte[] data = File.ReadAllBytes(filePath);
                string ext = Path.GetExtension(filePath).ToLowerInvariant();
                string contentType = "application/octet-stream";

                switch (ext)
                {
                    case ".html": contentType = "text/html; charset=utf-8"; break;
                    case ".js": contentType = "application/javascript; charset=utf-8"; break;
                    case ".css": contentType = "text/css; charset=utf-8"; break;
                    case ".json": contentType = "application/json; charset=utf-8"; break;
                    case ".svg": contentType = "image/svg+xml"; break;
                    case ".png": contentType = "image/png"; break;
                    case ".ico": contentType = "image/x-icon"; break;
                    case ".woff2": contentType = "font/woff2"; break;
                    case ".wasm": contentType = "application/wasm"; break;
                }

                context.Response.ContentType = contentType;
                context.Response.ContentLength64 = data.Length;
                context.Response.AddHeader("Access-Control-Allow-Origin", "*");
                context.Response.AddHeader("Cache-Control", "no-cache");
                context.Response.OutputStream.Write(data, 0, data.Length);
                context.Response.OutputStream.Close();
            }
            catch
            {
                try { context.Response.StatusCode = 500; context.Response.Close(); } catch { }
            }
        }
    }
}
