import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function TicketMarkdown({ value }: { value: string }) {
  return (
    <div className="ticket-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children }) {
            if (!href) return <span>{children}</span>
            const video = /^https?:\/\//i.test(href) && /\.(?:mp4|webm|ogv)(?:[?#]|$)/i.test(href)
            return video ? (
              <span className="ticket-video">
                <video src={href} controls preload="metadata" playsInline />
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              </span>
            ) : (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            )
          },
          img({ src, alt }) {
            if (!src) return null
            return <img src={src} alt={alt || '图片'} loading="lazy" referrerPolicy="no-referrer" />
          },
        }}
      >
        {value}
      </ReactMarkdown>
    </div>
  )
}
