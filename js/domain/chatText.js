// Hooshvareh sometimes writes a proposal as text («<propose_log_food>{…}</propose_log_food>»)
// instead of calling the tool. The Edge Function turns those into cards; here the text is
// hidden so the person never sees raw JSON. While a reply is still streaming, an opened
// block with no end yet is hidden too.
export function hideCalls(text) {
  return String(text ?? '')
    .replace(/<(propose_[a-z_]+)>[\s\S]*?<\/\1>/g, '')
    .replace(/<propose_[a-z_]*(>[\s\S]*)?$/, '')
    .replace(/<\/?propose_[a-z_]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
