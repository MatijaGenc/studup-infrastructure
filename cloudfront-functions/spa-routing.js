function handler(event) {
    var request = event.request
    var uri = request.uri
    var routes = [
        '/landing',
        '/auth',
        '/privacy',
        '/home',
        '/about-me',
        '/support',
        '/requests-and-complains',
        '/alerts',
        '/admin',
        '/notifications',
    ]
    var normalized = uri.length > 1 && uri.charAt(uri.length - 1) === '/' ? uri.slice(0, -1) : uri
    if (routes.indexOf(normalized) !== -1) {
        request.uri = '/index.html'
    }
    return request
}
