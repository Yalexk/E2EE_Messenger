import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { LogOut } from 'lucide-react'; // or wherever your icon is from

const Navbar = () => {
  const { authUser, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = (e) => {
    e.preventDefault();
    logout();
    navigate("/login");
  };

  return (
    <nav style={{ display: "flex", gap: "1rem", padding: "1rem", borderBottom: "1px solid #ccc" }}>
      <Link to="/">Home</Link>
      {!authUser && <Link to="/login">Login</Link>}
      {!authUser && <Link to="/signup">Sign Up</Link>}
      {authUser && (
        <button
          className="flex gap-2 items-center"
          onClick={handleLogout}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "blue" }}
        >
          <LogOut className="size-5" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      )}
    </nav>
  );
};

export default Navbar;
