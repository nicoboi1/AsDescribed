import { useEffect, useState } from "react";
import { Nav } from "./components/Nav";
import { HomePage } from "./pages/HomePage";
import { AppPage } from "./pages/AppPage";

function readRoute(): string {
  const h = window.location.hash.replace(/^#\/?/, "").trim();
  return h === "app" ? "app" : "home";
}

export function App() {
  const [route, setRoute] = useState<string>(readRoute());

  useEffect(() => {
    const on = () => setRoute(readRoute());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  function navigate(r: string) {
    if (window.location.hash !== `#/${r}`) window.location.hash = `#/${r}`;
    else setRoute(r);
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }

  return (
    <>
      <Nav route={route} navigate={navigate} />
      {route === "app" ? <AppPage /> : <HomePage navigate={navigate} />}
    </>
  );
}
