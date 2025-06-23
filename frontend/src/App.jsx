import Navbar from "./components/Navbar";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import SignUpPage from "./pages/SignUpPage";

import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/useAuthStore";
import { useEffect } from "react";
import { Loader} from "lucide-react";

const App = () => {
  const {authUser, checkAuth, isCheckingAuth} = useAuthStore()

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  console.log({ authUser });

  if(isCheckingAuth && !authUser) return (
    <div className="flex items-center justify-center h-screen">
      <Loader className="size-10 animate-spin" />
    </div>
  );

  return (
    <div>

      <Navbar />
      <Routes>
        <Route path="/" element={ authUser ? <HomePage /> : <Navigate to="/login" />} /> 
        <Route path="/signup" element={!authUser ? <SignUpPage /> : <Navigate to='/' />} />
        <Route path="/login" element={!authUser ? <LoginPage /> : <Navigate to='/' />} />
      </Routes>
    </div>
  )};
export default App;