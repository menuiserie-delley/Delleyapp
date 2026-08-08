import http.server, functools, os
directory = os.path.dirname(os.path.abspath(__file__))
class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()
Handler = functools.partial(NoCacheHandler, directory=directory)
http.server.ThreadingHTTPServer(('0.0.0.0', 5173), Handler).serve_forever()
