type PlayerStatCardProps = {
  value?: number;
  label?: string;
  imageUrl?: string | null;
  progress: number;
  ariaLabel: string;
  onClick?: () => void;
};

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function PlayerStatCard({
  value,
  label,
  imageUrl = null,
  progress,
  ariaLabel,
  onClick,
}: PlayerStatCardProps) {
  const percentage = clampProgress(progress);
  const content = (imageUrl || (value === undefined ? "/assets/photos/nophoto.png" : null)) ? (
    <img
      src={imageUrl || "/assets/photos/nophoto.png"}
      alt=""
      className="absolute inset-0 block h-full w-full object-cover object-center"
    />
  ) : value !== undefined ? (
    <span className="relative z-10 text-[28px] leading-none text-[var(--aog-accent)]">
      {Math.max(1, Math.floor(value))}
    </span>
  ) : (
    <span className="relative z-10 px-2 text-center text-[7px] uppercase leading-[1.15] text-[#d8a92a]">
      {label}
    </span>
  );

  const body = (
    <>
      <div className="absolute inset-0 grid place-items-center overflow-hidden rounded-[13px]">
        {content}
      </div>

      <div
        className="absolute z-20 bottom-[5px] left-[7px] right-[7px] h-[8px] overflow-hidden rounded-full border border-[var(--aog-accent)] bg-[#080808]"
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full bg-[var(--aog-accent)] transition-[width] duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </>
  );

  const classes =
    "relative h-[68px] w-[70px] overflow-hidden rounded-[15px] border-2 border-[var(--aog-accent)] bg-[#080808]";

  if (onClick) {
    return (
      <button type="button" aria-label={ariaLabel} onClick={onClick} className={classes}>
        {body}
      </button>
    );
  }

  return (
    <div aria-label={ariaLabel} className={classes}>
      {body}
    </div>
  );
}
