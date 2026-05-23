"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Halftone } from "@/lib/halftone";
import type {
  HalftoneHandle,
  HalftoneOptions,
  SceneObject,
} from "@/lib/halftone";

export interface HalftoneSceneProps
  extends Omit<HalftoneOptions, "objects" | "onReady"> {
  /** 그릴 오브젝트 목록. 배열 순서대로 합성 — 나중일수록 앞쪽 */
  objects: SceneObject[];
  className?: string;
  /** 외부에서 인스턴스 제어가 필요할 때 (예: 새 위치 애니메이션) */
  onReady?: (handle: HalftoneHandle) => void;
}

/**
 * 범용 halftone 씬 컴포넌트. props 로 받은 오브젝트 배열을 캔버스에 합성한다.
 *
 * 사용 예:
 *   <HalftoneScene
 *     aspectRatio={1.5}
 *     objects={[
 *       { type:'image', src:'/mountain.avif', config:{ ...PRESETS.mountain } },
 *       { type:'video', src:'/cloud.mp4',     config:{ ...PRESETS.cloud, x:'5%', y:'10%' } },
 *     ]}
 *   />
 */
export const HalftoneScene = forwardRef<HalftoneHandle, HalftoneSceneProps>(
  function HalftoneScene({ objects, className, onReady, ...opts }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const handleRef = useRef<Halftone | null>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const inst = new Halftone(canvas, {
        ...opts,
        objects,
        onReady: () => {
          onReady?.(inst);
        },
      });
      handleRef.current = inst;
      return () => {
        inst.destroy();
        handleRef.current = null;
      };
      // 핵심 의존성: objects 배열 자체. 셰이더 옵션은 mount 후 변경 가정 안 함.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [objects]);

    useImperativeHandle(ref, () => ({
      setConfig: (n, p) => handleRef.current?.setConfig(n, p),
      getConfig: (n) => handleRef.current?.getConfig(n),
      pause: () => handleRef.current?.pause(),
      resume: () => handleRef.current?.resume(),
      destroy: () => handleRef.current?.destroy(),
    }));

    return (
      <canvas
        ref={canvasRef}
        className={className}
        style={{ display: "block", width: "100%" }}
      />
    );
  },
);
