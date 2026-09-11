import { useEffect, useRef, useState } from 'react';

export default function useFileDrop(onFiles) {
  const [dragActive, setDragActive] = useState(false);
  const depth = useRef(0);
  const reset = () => { depth.current = 0; setDragActive(false); };
  const isFileDrag = event => Array.from(event.dataTransfer?.types || []).includes('Files');

  useEffect(() => {
    window.addEventListener('dragend', reset);
    window.addEventListener('drop', reset);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('dragend', reset);
      window.removeEventListener('drop', reset);
      window.removeEventListener('blur', reset);
    };
  }, []);

  return {
    dragActive,
    onDragEnter(event) {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      depth.current += 1;
      setDragActive(true);
    },
    onDragOver(event) {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setDragActive(true);
    },
    onDragLeave(event) {
      if (!isFileDrag(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragActive(false);
    },
    onDrop(event) {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      reset();
      if (event.dataTransfer.files?.length) onFiles(event.dataTransfer.files);
    },
  };
}
