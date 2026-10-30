import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import emblem from "./assets/metsoft-emblem.webp";
import "./styles.css";
import "./workspace.css";
import "./components/reader.css";
import "./components/editor.css";
const favicon = document.createElement("link");
favicon.rel = "icon";
favicon.type = "image/webp";
favicon.href = emblem;
document.head.append(favicon);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
