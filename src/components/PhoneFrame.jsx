import { Outlet } from "react-router-dom";
import { useApp } from "../context/AppContext";

export default function PhoneFrame() {
  const { toastMsg, toastShow } = useApp();
  return (
    <div id="phone">
      <div className={`toast${toastShow ? " show" : ""}`}>{toastMsg}</div>
      <Outlet />
    </div>
  );
}
