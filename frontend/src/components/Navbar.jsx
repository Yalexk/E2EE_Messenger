import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { LogOut } from 'lucide-react';
import { useSessionStore } from '../store/useSessionStore';

const Navbar = () => {
  const { authUser, logout } = useAuthStore();
  const navigate = useNavigate();
  const { endSession } = useSessionStore();
  const handleLogout = (e) => {
    e.preventDefault();

    logout();
    endSession();
    navigate("/login");
  };

  return (
    <div className="navbar bg-base-100 shadow-sm">
      <div className="flex-1">
        <Link to="/" className="btn btn-ghost text-xl">Messenger</Link>
      </div>
      <div className="flex-none">
        <ul className="menu menu-horizontal px-1">
          {!authUser && (
            <>
              <li>
                <Link to="/login">Login</Link>
              </li>
              <li>
                <Link to="/signup">Sign Up</Link>
              </li>
            </>
          )}
          {authUser && (
            <li>
              <button
                className="flex gap-2 items-center"
                onClick={handleLogout}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
              >
                <LogOut className="size-5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
};

export default Navbar;
