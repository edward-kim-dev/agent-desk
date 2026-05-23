"use client";
import { useMemo } from "react";
import { HalftoneScene } from "../halftone";
import { PRESETS, type SceneObject } from "@/lib/halftone";

// canvasWidth / canvasHeight. tree(0.696), cloud(1.635)의 본연 비율을 유지하도록
// box 폭을 height %에서 역산: widthPercent = heightPercent × videoAspect / canvasAspect
const CANVAS_ASPECT = 2.2;

export function HomeTab() {
  const objects = useMemo<SceneObject[]>(() => {
    const treeH = 60; // %
    const treeAspect = 600 / 862; // 0.696
    const treeW = (treeH * treeAspect) / CANVAS_ASPECT; // ≈ 20.6%

    const cloudH = 54;
    const cloudAspect = 1256 / 768; // 1.635
    const cloudW = (cloudH * cloudAspect) / CANVAS_ASPECT; // ≈ 40.1%

    return [
      {
        name: "hill",
        type: "image",
        src: "/assets/halftone/meadow.webp",
        config: {
          ...PRESETS.image,
          x: 0,
          y: "35%",
          width: "100%",
          height: "65%",
          xSquares: 220,
          blackPoint: 130,
          gamma: 0.35,
        },
      },
      {
        name: "tree",
        type: "video",
        src: "/assets/halftone/tree.mp4",
        config: {
          ...PRESETS.tree,
          x: `${100 - treeW - 3}%`,
          y: "9.5%",
          width: `${treeW}%`,
          height: `${treeH}%`,
        },
      },
      {
        name: "cloud",
        type: "video",
        src: "/assets/halftone/cloud.mp4",
        config: {
          ...PRESETS.cloud,
          x: "14%",
          y: "4%",
          width: `${cloudW}%`,
          height: `${cloudH}%`,
        },
      },
    ];
  }, []);

  return (
    <article className="flex h-full flex-col text-[#1a1208]">
      <section className="grid grid-cols-[1.4fr_1fr] items-end gap-[3vw] pb-[2.1vw]">
        <h1 className="font-light leading-[0.98] tracking-[-0.025em] text-[clamp(32px,4.6vw,64px)]">
          memory · hooks
          <br />
          agents · adapters.
        </h1>
        <div>
          <div className="text-[clamp(10px,0.78vw,12px)] font-semibold uppercase tracking-[0.24em]">
            Agent Desk
          </div>
          <p className="mt-[0.6vh] max-w-[42ch] text-[clamp(13px,1vw,15px)] leading-[1.6] opacity-70">
            하네스 관리 도구. Claude · Codex · Gemini 의 메모리, 훅,
            서브에이전트, 어댑터를 한 화면에서 정합한다.
          </p>
          <div className="mt-[1vh] text-[10px] uppercase tracking-[0.24em] opacity-45">
            2026 / build 0.2
          </div>
        </div>
      </section>

      <figure className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden">
        <HalftoneScene
          aspectRatio={CANVAS_ASPECT}
          objects={objects}
          className="block w-full"
        />
        <figcaption className="mt-[0.85vw] flex justify-between text-[10px] uppercase tracking-[0.22em] opacity-50">
          <span>3-layer composition · cloud · mountain · tree</span>
          <span>Agent Desk</span>
        </figcaption>
      </figure>
    </article>
  );
}
