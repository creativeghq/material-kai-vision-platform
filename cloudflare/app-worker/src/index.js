import { kbPrerender } from './kbPrerender.js';
import { sitemap } from './sitemap.js';

const KB_ARTICLE = /^\/knowledge-base\/(?!brands\/?$)([^/]+)\/?$/;

export const SPA_ROUTE =
  /^\/(?!api|assets|avatars|covers|models|static|documentation|embed|fonts|favicon\.ico|robots\.txt|sitemap\.xml|llms\.txt|site\.webmanifest|sw\.js|wp-admin|wp-content|wp-includes|wp-json|xmlrpc|phpmyadmin|cgi-bin|actuator|server-status)(?!\.(?!well-known))(?!.*\/\.)(?!.*\.(?:html|htm|php|phtml|asp|aspx|jsp|cgi|pl|sql|bak|old|swp|zip|rar|7z|tar|tgz|gz|env)(?:$|\/)).*$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/sitemap.xml') return sitemap(url, env);

    const kb = url.pathname.match(KB_ARTICLE);
    if (kb) return kbPrerender(request, url, decodeURIComponent(kb[1]), env);

    const res = await env.ASSETS.fetch(request);
    if (res.status !== 404 || !SPA_ROUTE.test(url.pathname)) return res;

    return env.ASSETS.fetch(new Request(new URL('/', url), request));
  },
};
