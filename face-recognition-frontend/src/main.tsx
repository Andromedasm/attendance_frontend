import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import "./theme.scss";
import App from "./App.tsx";
import ThemeProvider from "./ThemeProvider.tsx";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <ThemeProvider>
            <App />
        </ThemeProvider>
    </React.StrictMode>
);
