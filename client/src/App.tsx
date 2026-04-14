import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";

const App = () => {
  const token = localStorage.getItem("token");

  return (
    <BrowserRouter>
      <Routes>
        {!token ? (
          <Route path="*" element={<Login />} />
        ) : (
          <>
            <Route path="/dashboard" element={<Dashboard />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  );
};

export default App;
