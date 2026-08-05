import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import LogViewer from "./LogViewer";
import "./index.css";

const urlParams = new URLSearchParams(window.location.search);
const isLogWindow = urlParams.get('window') === 'logs';

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isLogWindow ? <LogViewer /> : <App />}
  </React.StrictMode>,
);
