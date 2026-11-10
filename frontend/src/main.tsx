import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { installKeyPress } from "./utils/a11y";

installKeyPress();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
