import { Sparkles, Sun } from "lucide-react";
import Link from "next/link";
import type { FormConfig } from "@/types";
export function FormIntro({ config }: { config: FormConfig | null }) {
  return (
    <aside className="intro">
      <div className="eyebrow">
        <span className="small-line" /> YOUR PLACE TO GROW
      </div>
      <h1>{config?.title || "Your next chapter starts here."}</h1>
      <p className="intro-description">
        {config
          ? config.description
          : "A little about you. A time that works. Let’s meet and discover what we can build together."}
      </p>
      <Link className="text-button" href="/schedule-check">
        Already submitted? Check your interview schedule →
      </Link>
      <div className="community-art" aria-hidden="true">
        <div className="art-orbit" />
        <div className="art-card purple">
          <Sparkles size={31} />
          <span>New connections.</span>
        </div>
        <div className="art-card blue">
          <span className="art-face">◡</span>
          <span>Fresh perspectives.</span>
        </div>
        <div className="art-card green">
          <span className="art-star">✳</span>
          <span>Your next chapter.</span>
        </div>
        <div className="art-card amber">
          <Sun size={38} />
          <span>Shared ambitions.</span>
        </div>
        <div className="art-dot orange" />
        <div className="art-dot purple-dot" />
      </div>
      <div className="intro-note">
        <div className="tiny-avatars">
          <i>A</i>
          <i>B</i>
          <i>C</i>
        </div>
        <span>
          A community of possibilities.
          <br />
          <strong>We can’t wait to meet you.</strong>
        </span>
      </div>
    </aside>
  );
}
