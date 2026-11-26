import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import "./styles.css";
import "./app/themes/event-themes.css";

const AdminPage = React.lazy(() => import("./features/admin/components/AdminPage"));
const isAdminPath = /^\/admin\/?$/.test(window.location.pathname);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isAdminPath ? (
      <React.Suspense
        fallback={
          <p className="page-container" role="status">
            Ładuję panel…
          </p>
        }
      >
        <AdminPage />
      </React.Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
