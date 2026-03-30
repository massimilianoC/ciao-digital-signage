import { authMiddleware } from "./src/edge/auth-middleware";

export const middleware = authMiddleware;
export const config = {
	matcher: [
		// CMS pages
		"/dashboard/:path*",
		"/admin/:path*",
		"/content/:path*",
		"/webapps/:path*",
		"/playlists/:path*",
		"/screens/:path*",
		"/schedules/:path*",
		// API routes
		"/api/orgs/:path*",
		"/api/content/:path*",
		"/api/playlists/:path*",
		"/api/screens/:path*",
		"/api/schedules/:path*",
		"/api/groups/:path*",
		"/api/webapps/:path*",
		"/api/override/:path*",
		"/api/force-override/:path*",
	],
};
