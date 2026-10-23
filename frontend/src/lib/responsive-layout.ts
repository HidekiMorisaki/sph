// Keep these conditions aligned with the component CSS media queries.
// any-pointer also covers touch devices with a connected mouse or trackpad.
export const PHONE_LANDSCAPE_QUERY = '(min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse)';
export const COMPACT_CONTENT_QUERY = `(max-width:700px), ${PHONE_LANDSCAPE_QUERY}`;
export const COMPACT_NAVIGATION_QUERY = `(max-width:760px), ${PHONE_LANDSCAPE_QUERY}`;
