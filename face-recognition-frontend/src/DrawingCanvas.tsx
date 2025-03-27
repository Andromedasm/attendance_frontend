import React, {useEffect, useRef} from 'react';
import {fabric} from 'fabric';

const DrawingCanvas = () => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = new fabric.Canvas('drawingCanvas');
        canvas.isDrawingMode = true;

        canvas.freeDrawingBrush.color = 'black';
        canvas.freeDrawingBrush.width = 5;

        // 适应屏幕大小
        canvas.setWidth(window.innerWidth);
        canvas.setHeight(window.innerHeight);

        return () => {
            canvas.dispose();
        };
    }, []);

    return <canvas id="drawingCanvas" ref={canvasRef}/>;
};

export default DrawingCanvas;
