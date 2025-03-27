import Pressure from 'pressure';

useEffect(() => {
    const canvas = new fabric.Canvas('drawingCanvas');
    canvas.isDrawingMode = true;

    canvas.freeDrawingBrush.color = 'black';
    canvas.freeDrawingBrush.width = 5;

    canvas.setWidth(window.innerWidth);
    canvas.setHeight(window.innerHeight);

    // 添加压力感应
    Pressure.set('#drawingCanvas', {
        change: (force) => {
            canvas.freeDrawingBrush.width = force * 4096; // 根据压力调整笔刷粗细
        },
    });

    return () => {
        canvas.dispose();
    };
}, []);
