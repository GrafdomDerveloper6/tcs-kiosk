import { Icon } from "../icons";

export type SelectionCard = {
  key: string;
  icon: Parameters<typeof Icon>[0]["name"];
  title: string;
  desc: string;
  onSelect: () => void;
  /** Solid red "recommended" treatment instead of the plain outlined card. */
  featured?: boolean;
};

export function SelectionScreen({
  eyebrow,
  headline,
  subhead,
  cards,
}: {
  eyebrow?: string;
  headline: string;
  subhead?: string;
  cards: SelectionCard[];
}) {
  return (
    <>
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <div className="headline">{headline}</div>
        {subhead && <div className="subhead">{subhead}</div>}
        <div className="rule" />
      </div>
      <div className="cards-col" style={{ marginTop: 8 }}>
        {cards.map((c) => (
          <div
            key={c.key}
            className={`card ${c.featured ? "featured" : ""}`}
            onClick={c.onSelect}
          >
            <div className="icon">
              <Icon name={c.icon} />
            </div>
            <div className="txt">
              <div className="title">{c.title}</div>
              <div className="desc">{c.desc}</div>
            </div>
            <div className="card-arrow">
              <Icon name="send" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
