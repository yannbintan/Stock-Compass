// Static SVG/PNG assets need no database or image service.
// nodejs_compat exposes Worker secrets through process.env on the server.
import handler from "vinext/server/app-router-entry";

export default handler;
