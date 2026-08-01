type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
};

type ArchitectChatProps = {
  messages: ChatMessage[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
};

export type { ChatMessage };

export function ArchitectChat({
  messages,
  draft,
  onDraftChange,
  onSend,
}: ArchitectChatProps) {
  return (
    <section className="chat-section glass-panel" id="projects" dir="rtl">
      <div className="section-heading-row chat-heading">
        <div>
          <span className="eyebrow">02 · توجيه إبداعي</span>
          <h2>💬 الدردشة الذكية: المساعد المعماري المصري</h2>
        </div>
        <span className="online-pill"><i /> متصل الآن</span>
      </div>
      <div className="chat-window" aria-live="polite">
        {messages.map((message) => (
          <div className={`chat-message ${message.role}`} key={message.id}>
            <span className="chat-avatar" aria-hidden="true">{message.role === "assistant" ? "م" : "أ"}</span>
            <div className="message-bubble">
              <span className="message-author">{message.role === "assistant" ? "المساعد المعماري" : "أنت"}</span>
              <p>{message.text}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="chat-composer">
        <textarea
          aria-label="رسالة المساعد المعماري"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
          placeholder="اسأل المساعد عن الطراز، المواد، أو الإضاءة..."
          rows={1}
        />
        <button className="send-button" aria-label="إرسال الرسالة" onClick={onSend}>➤</button>
      </div>
    </section>
  );
}
