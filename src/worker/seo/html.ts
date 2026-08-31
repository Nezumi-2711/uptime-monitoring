import { renderMetaTags, type SeoHead } from './meta';

class RemoveElementHandler implements HTMLRewriterElementContentHandlers {
	element(element: Element) {
		element.remove();
	}
}

class TitleHandler implements HTMLRewriterElementContentHandlers {
	constructor(private readonly title: string) {}

	element(element: Element) {
		element.setInnerContent(this.title);
	}
}

class HeadHandler implements HTMLRewriterElementContentHandlers {
	constructor(private readonly head: SeoHead) {}

	element(element: Element) {
		element.append(renderMetaTags(this.head), { html: true });
	}
}

export function rewriteHead(assetResponse: Response, head: SeoHead): Response {
	const remove = new RemoveElementHandler();
	return new HTMLRewriter()
		.on('title', new TitleHandler(head.title))
		.on('meta[name="description"]', remove)
		.on('meta[name="robots"]', remove)
		.on('meta[property^="og:"]', remove)
		.on('meta[name^="twitter:"]', remove)
		.on('link[rel="canonical"]', remove)
		.on('head', new HeadHandler(head))
		.transform(assetResponse);
}
