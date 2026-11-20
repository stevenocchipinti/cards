import type { ReactNode } from "react";

type Props = {
  code: string;
  /** #9's compass toggle goes here. */
  modeSwitch?: ReactNode;
  /** Shown only to the Host: opens the dealer tray (#7). */
  onHost?: () => void;
  onLeave: () => void;
};

export function TopBar({ code, modeSwitch, onHost, onLeave }: Props) {
  return (
    <header className="play-top">
      <div className="play-top__code">
        <span className="play-top__label">Room</span>
        <span className="play-top__value">{code}</span>
      </div>
      <div className="play-top__mode">{modeSwitch}</div>
      <div className="play-top__actions">
        {onHost && (
          <button type="button" className="top-btn top-btn--host" onClick={onHost}>
            HOST
          </button>
        )}
        <button type="button" className="top-btn" onClick={onLeave}>
          Leave
        </button>
      </div>
    </header>
  );
}
