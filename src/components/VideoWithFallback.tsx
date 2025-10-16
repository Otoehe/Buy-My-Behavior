import React, {
  useEffect, useMemo, useRef, useImperativeHandle,
  forwardRef, useState
} from "react";

type Props = {
  cidOrUrl: string;      // CID або абсолютний URL
  poster?: string;
  loop?: boolean;
  className?: string;
  dataId?: string;       // щоб IntersectionObserver бачив data-id
};

const gateways = [
  (cid: string) => `https://gateway.lighthouse.storage/ipfs/${cid}`,
  (cid: string) => `https://cloudflare-ipfs.com/ipfs/${cid}`,
  (cid: string) => `https://ipfs.io/ipfs/${cid}`,
];

const looksLikeCid = (s: string) => s && !/^https?:\/\//i.test(s);

const VideoWithFallback = forwardRef<HTMLVideoElement, Props>(
  ({ cidOrUrl, poster, loop = true, className = "", dataId }, ref) => {
    const [idx, setIdx] = useState(0);
    const vref = useRef<HTMLVideoElement>(null);
    useImperativeHandle(ref, () => vref.current as HTMLVideoElement, []);

    const src = useMemo(() => {
      if (!cidOrUrl) return "";
      return looksLikeCid(cidOrUrl)
        ? gateways[Math.min(idx, gateways.length - 1)](cidOrUrl)
        : cidOrUrl;
    }, [cidOrUrl, idx]);

    useEffect(() => {
      const v = vref.current;
      if (!v) return;
      v.muted = true;        // для autoplay
      v.playsInline = true;
      v.autoplay = true;
      v.loop = loop;
      const t = setTimeout(() => v.play().catch(() => {}), 30);
      return () => clearTimeout(t);
    }, [src, loop]);

    const onError = () => {
      if (idx < gateways.length - 1) setIdx(idx + 1);
    };

    return (
      <video
        ref={vref}
        src={src}
        poster={poster}
        muted
        playsInline
        autoPlay
        loop={loop}
        preload="metadata"
        onLoadedData={() => vref.current?.play().catch(() => {})}
        onError={onError}
        data-id={dataId}
        className={className}
      />
    );
  }
);

export default VideoWithFallback;
