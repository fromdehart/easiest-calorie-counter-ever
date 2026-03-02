import { ConvexProvider } from "convex/react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { convex } from "./lib/convexClient";
import { VoteATron3000 } from "./components/VoteATron3000";
import { VoteATronErrorBoundary } from "./components/VoteATronErrorBoundary";
import Index from "./pages/Index";

const App = () => {
  return (
    <ConvexProvider client={convex}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
        </Routes>
        <VoteATronErrorBoundary>
          <VoteATron3000 />
        </VoteATronErrorBoundary>
      </BrowserRouter>
    </ConvexProvider>
  );
};

export default App;
