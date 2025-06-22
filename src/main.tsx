import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { FamilyFederationAuthProvider } from "./components/auth/FamilyFederationAuth.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FamilyFederationAuthProvider>
      <App />
    </FamilyFederationAuthProvider>
  </StrictMode>,
);
