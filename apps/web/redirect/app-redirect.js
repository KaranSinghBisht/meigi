// meigi-app.karanbishttt.workers.dev used to serve a second copy of the app. The app and the landing are one
// site now, so this Worker only forwards every old link (path and query kept) to the canonical host.
const CANONICAL_HOST = 'meigi.karanbishttt.workers.dev'

export default {
  fetch(request) {
    const url = new URL(request.url)
    url.hostname = CANONICAL_HOST
    url.port = ''
    url.protocol = 'https:'
    return Response.redirect(url.toString(), 301)
  },
}
