import { useEffect, useState } from "react";

export function usePlayback(duration: number, shown = true) {
  const [offset, setOffset] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const ended = duration === 0 || offset >= duration;
  useEffect(() => {
    if (!shown || !playing || ended) return;
    let timer: ReturnType<typeof setTimeout>;
    let previous = Date.now();
    const advance = () => {
      const at = Date.now();
      const delta = Math.max(0, at - previous) * speed;
      previous = at;
      setOffset((current) => Math.min(duration, current + delta));
      timer = setTimeout(advance, 150);
    };
    timer = setTimeout(advance, 150);
    return () => clearTimeout(timer);
  }, [shown, playing, ended, speed, duration]);
  const seek = (value: number) => {
    setPlaying(false);
    setOffset(Math.min(duration, Math.max(0, value)));
  };
  const toggle = () => {
    if (ended) setOffset(0);
    setPlaying(ended || !playing);
  };
  return { offset, playing: playing && !ended, speed, setSpeed, seek, toggle, pause: () => setPlaying(false) };
}
