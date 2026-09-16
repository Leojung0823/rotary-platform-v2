import { linkifySegments } from "@/lib/events/linkify";

/**
 * An organiser's description, with any http(s) link in it made tappable.
 *
 * Rendered from parsed segments rather than by putting markup into the string:
 * the text is written by a club officer and must never be able to introduce
 * elements of its own.
 */
export function EventDescription({ className, text }: { className?: string; text: string }) {
  return <p className={className}>
    {linkifySegments(text).map((segment, index) => (segment.kind === "link"
      ? <a
        href={segment.href}
        key={`${index}-${segment.href}`}
        rel="noreferrer noopener"
        target="_blank"
      >{segment.value}</a>
      : <span key={`${index}-text`}>{segment.value}</span>))}
  </p>;
}
