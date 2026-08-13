import React, { useEffect, useRef, useState } from 'react';
import './TrackingTask.css';

interface TrackingTaskProps {
  isActive: boolean;
  onSampleError?: (errorPx: number) => void;
}

export const TrackingTask: React.FC<TrackingTaskProps> = ({ isActive, onSampleError }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const targetPosRef = useRef({ x: 300, y: 200 });
  const [currentError, setCurrentError] = useState<number>(0);
  const [avgError, setAvgError] = useState<number>(0);
  
  const samplesRef = useRef<number[]>([]);

  // Dynamically size canvas to fill container
  useEffect(() => {
    if (!isActive) return;

    const updateCanvasSize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (container && canvas) {
        const rect = container.getBoundingClientRect();
        const w = Math.max(300, Math.floor(rect.width - 24));
        const h = Math.max(180, Math.floor(rect.height - 60));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
      }
    };

    updateCanvasSize();
    const observer = new ResizeObserver(updateCanvasSize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [isActive]);

  const onSampleErrorRef = useRef(onSampleError);
  useEffect(() => {
    onSampleErrorRef.current = onSampleError;
  }, [onSampleError]);

  useEffect(() => {
    if (!isActive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let sampleTimer: ReturnType<typeof setInterval>;
    let startTime = performance.now();

    const render = (now: number) => {
      const t = (now - startTime) / 1000;
      const width = canvas.width;
      const height = canvas.height;

      // Lissajous smooth path for target movement across full canvas
      const radiusX = (width / 2) - 40;
      const radiusY = (height / 2) - 40;
      const centerX = width / 2;
      const centerY = height / 2;

      const targetX = centerX + radiusX * Math.sin(t * 0.35);
      const targetY = centerY + radiusY * Math.sin(t * 0.55);
      targetPosRef.current = { x: targetX, y: targetY };

      // Calculate pixel distance error
      const dx = mousePosRef.current.x - targetX;
      const dy = mousePosRef.current.y - targetY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      ctx.clearRect(0, 0, width, height);

      // Draw outer target circle
      ctx.beginPath();
      ctx.arc(targetX, targetY, 28, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(230, 87, 34, 0.2)';
      ctx.fill();
      ctx.strokeStyle = '#E65722';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Draw center dot
      ctx.beginPath();
      ctx.arc(targetX, targetY, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#ffb347';
      ctx.fill();

      // Draw line to cursor if mouse is over canvas
      ctx.beginPath();
      ctx.moveTo(targetX, targetY);
      ctx.lineTo(mousePosRef.current.x, mousePosRef.current.y);
      ctx.strokeStyle = dist < 35 ? 'rgba(74, 222, 128, 0.7)' : 'rgba(248, 113, 113, 0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      setCurrentError(Math.round(dist));

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    // Sample tracking error once per second for metrics logging
    sampleTimer = setInterval(() => {
      const dx = mousePosRef.current.x - targetPosRef.current.x;
      const dy = mousePosRef.current.y - targetPosRef.current.y;
      const dist = Math.round(Math.sqrt(dx * dx + dy * dy));
      samplesRef.current.push(dist);
      
      const sum = samplesRef.current.reduce((a, b) => a + b, 0);
      const avg = Math.round(sum / samplesRef.current.length);
      setAvgError(avg);

      if (onSampleErrorRef.current) {
        onSampleErrorRef.current(dist);
      }
    }, 1000);

    return () => {
      cancelAnimationFrame(animId);
      clearInterval(sampleTimer);
    };
  }, [isActive]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mousePosRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  if (!isActive) return null;

  return (
    <div className="tracking-task-container" ref={containerRef}>
      <div className="tracking-task-header">
        <span className="tracking-title">Primary Task: Visual Target Tracking</span>
        <div className="tracking-stats">
          <span className="stat-pill">Error: {currentError}px</span>
          <span className="stat-pill accent">Mean: {avgError}px</span>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className="tracking-canvas"
        onMouseMove={handleMouseMove}
      />
      <div className="tracking-hint">Keep cursor inside target ring to minimize tracking error</div>
    </div>
  );
};
