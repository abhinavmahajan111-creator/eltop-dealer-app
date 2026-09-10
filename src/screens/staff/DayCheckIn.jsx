import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import { getCurrentPosition, getVideoDuration, uploadVisitMedia } from "../../utils/visitMedia";
import { CameraPhotoSlot, CameraVideoSlot } from "../../components/staff/CameraCapture";
import LocationPermissionBanner from "../../components/staff/LocationPermissionBanner";

// Combined "Day" + "Check In" screen, replacing the old separate
// StartDay.jsx / CheckIn.jsx screens — approved from a mockup. Two tabs:
//
//   🛵 Day — start the day (bike/vehicle meter-reading photo, no
//   geofence), end the day (blocked while a visit is still open — no
//   hanging open visits), and a running Day Activity log (day start/end,
//   check-ins/outs, plus free-text notes the rep adds themselves).
//
//   📍 Check In — pick a dealer to check in at (blocked until the day is
//   started, and fully blocked once the day has ended — no check-ins
//   after "End Day", to avoid attendance confusion). Only one open
//   check-in at a time: once checked in, this tab becomes the checkout
//   screen and stays that way — mandatory checkout, no picking another
//   dealer — until checkout is confirmed.
//
// Every photo/video capture point uses CameraPhotoSlot/CameraVideoSlot —
// a live camera stream, never a file/gallery picker — with geo-tag +
// timestamp burned onto every photo.

const BOX_STYLE = {
  background: "#fff", border: "1.5px solid #7B2D8B", borderRadius: 14,
  padding: 16, marginBottom: 14, boxShadow: "0 2px 8px rgba(123,45,139,0.06)",
};

function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function timeLabel(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

const ACTIVITY_ICON = { start: "🛵", end: "⏹", checkin: "📍", checkout: "✅", note: "📝" };

export default function DayCheckIn() {
  const navigate = useNavigate();
  const location = useLocation();
  // Dashboard's two-button row (once the day is started) passes an explicit
  // tab via navigation state — e.g. { state: { tab: "day" } } — so tapping
  // "🛵 Day" there always lands on Day even though Check In is otherwise
  // the default once the day has started. Falls back to the normal
  // auto-selection below when nothing is passed (direct URL, redirects,
  // the amber "checked in" banner, etc).
  const requestedTab = location.state?.tab === "day" || location.state?.tab === "checkin" ? location.state.tab : null;

  const [activeTab, setActiveTab] = useState("day");
  const defaultTabSetRef = useRef(false);

  const [dayStart, setDayStart] = useState(null);
  const [loadingDayStart, setLoadingDayStart] = useState(true);

  const [openVisit, setOpenVisit] = useState(null);
  const [loadingOpenVisit, setLoadingOpenVisit] = useState(true);

  const [dealers, setDealers] = useState([]);
  const [loadingDealers, setLoadingDealers] = useState(true);
  const [dealerError, setDealerError] = useState(null);
  const [search, setSearch] = useState("");

  const [activity, setActivity] = useState([]);
  const [loadingActivity, setLoadingActivity] = useState(true);

  const [meterFile, setMeterFile] = useState(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);

  const [endingDay, setEndingDay] = useState(false);
  const [endDayError, setEndDayError] = useState(null);

  const [noteInput, setNoteInput] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const [checkingInId, setCheckingInId] = useState(null);
  const [checkInError, setCheckInError] = useState(null);

  // "+ Add New Dealer" — a rep can log a brand-new shop straight from the
  // field, no admin step first. It shows up in their own Check In list
  // immediately (tagged "New"), and check-in/checkout both work on it
  // right away — approval is just an admin review step, not a gate.
  const [showAddDealer, setShowAddDealer] = useState(false);
  const [newShopName, setNewShopName] = useState("");
  const [newOwnerName, setNewOwnerName] = useState("");
  const [newAlias, setNewAlias] = useState("");
  const [newWhatsapp, setNewWhatsapp] = useState("");
  const [newAlternate, setNewAlternate] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [addingDealer, setAddingDealer] = useState(false);
  const [addDealerError, setAddDealerError] = useState(null);

  // Duplicate-phone check — as the rep types either number, look it up
  // live against other field-added dealers and real dealer profiles.
  // Purely a nudge (never blocks Add) — same phone can legitimately be
  // shared across shops (e.g. a family business, an office landline).
  const [dupMatches, setDupMatches] = useState([]);
  const [checkingDup, setCheckingDup] = useState(false);
  const dupTimerRef = useRef(null);

  useEffect(() => {
    if (dupTimerRef.current) clearTimeout(dupTimerRef.current);
    const w = newWhatsapp.trim();
    const a = newAlternate.trim();
    if (w.length < 6 && a.length < 6) {
      setDupMatches([]);
      return;
    }
    dupTimerRef.current = setTimeout(async () => {
      setCheckingDup(true);
      try {
        const { data, error } = await supabase.rpc("check_duplicate_dealer_phone", {
          p_whatsapp: w.length >= 6 ? w : null,
          p_alternate: a.length >= 6 ? a : null,
        });
        setDupMatches(error ? [] : data || []);
      } catch {
        setDupMatches([]);
      } finally {
        setCheckingDup(false);
      }
    }, 600);
    return () => { if (dupTimerRef.current) clearTimeout(dupTimerRef.current); };
  }, [newWhatsapp, newAlternate]);

  const [boardFile, setBoardFile] = useState(null);
  const [shopFile, setShopFile] = useState(null);
  const [cardFile, setCardFile] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [checkoutNotes, setCheckoutNotes] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkOutError, setCheckOutError] = useState(null);

  const loadDayStart = () => {
    setLoadingDayStart(true);
    return supabase.rpc("get_my_day_start").then(({ data, error }) => {
      if (!error) setDayStart((Array.isArray(data) ? data[0] : data) || null);
      setLoadingDayStart(false);
    });
  };

  const loadOpenVisit = () => {
    setLoadingOpenVisit(true);
    return supabase.rpc("get_my_open_visit").then(({ data, error }) => {
      if (!error) setOpenVisit((Array.isArray(data) ? data[0] : data) || null);
      setLoadingOpenVisit(false);
    });
  };

  const loadActivity = () => {
    setLoadingActivity(true);
    return supabase.rpc("get_my_day_activity").then(({ data, error }) => {
      if (!error) setActivity(data || []);
      setLoadingActivity(false);
    });
  };

  const loadDealers = () => {
    setLoadingDealers(true);
    return supabase.rpc("get_my_dealers").then(({ data, error }) => {
      if (error) setDealerError(error.message);
      else { setDealerError(null); setDealers(data || []); }
      setLoadingDealers(false);
    });
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoadingDayStart(false); setLoadingOpenVisit(false); setLoadingDealers(false); setLoadingActivity(false);
      return;
    }
    let cancelled = false;
    Promise.all([
      supabase.rpc("get_my_dealers"),
      supabase.rpc("get_my_open_visit"),
      supabase.rpc("get_my_day_start"),
      supabase.rpc("get_my_day_activity"),
    ]).then(([dealersRes, openRes, dayRes, activityRes]) => {
      if (cancelled) return;
      if (dealersRes.error) setDealerError(dealersRes.error.message);
      else setDealers(dealersRes.data || []);
      const open = (Array.isArray(openRes.data) ? openRes.data[0] : openRes.data) || null;
      setOpenVisit(open);
      const day = (Array.isArray(dayRes.data) ? dayRes.data[0] : dayRes.data) || null;
      setDayStart(day);
      setActivity(activityRes.data || []);

      if (!defaultTabSetRef.current) {
        defaultTabSetRef.current = true;
        if (requestedTab) {
          // Explicit tab requested via navigation state (dashboard's
          // "🛵 Day" / "📍 Check In" buttons) — honor it as-is.
          setActiveTab(requestedTab);
        } else if (!day || day.ended_at) {
          // Default lands on whichever tab is actionable: Day if there's
          // nothing to check in for yet (not started / already ended),
          // otherwise Check In — which, if already checked in somewhere,
          // is the checkout screen. Never defaults back to Day after a
          // check-in.
          setActiveTab("day");
        } else {
          setActiveTab("checkin");
        }
      }

      setLoadingDealers(false);
      setLoadingOpenVisit(false);
      setLoadingDayStart(false);
      setLoadingActivity(false);
    });
    return () => { cancelled = true; };
  }, []);

  const filteredDealers = dealers.filter((d) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (d.name || "").toLowerCase().includes(q)
      || (d.dealer_code || "").toLowerCase().includes(q)
      || (d.alias_name || "").toLowerCase().includes(q);
  });

  const handleStartDay = async () => {
    setStartError(null);
    if (!meterFile) { setStartError("Take your meter-reading photo first."); return; }
    setStarting(true);
    try {
      const pos = await getCurrentPosition();
      const url = await uploadVisitMedia(meterFile, { folder: "day-start", kind: "meter" });
      const { data, error } = await supabase.rpc("start_day", {
        p_latitude: pos.latitude, p_longitude: pos.longitude, p_meter_photo_url: url,
      });
      const result = Array.isArray(data) ? data[0] : data;
      if (error || !result?.success) {
        setStartError(error?.message || result?.message || "Couldn't start your day.");
      } else {
        setMeterFile(null);
        await Promise.all([loadDayStart(), loadActivity()]);
        setActiveTab("checkin");
      }
    } catch (err) {
      setStartError(err.message || "Couldn't start your day.");
    } finally {
      setStarting(false);
    }
  };

  const handleEndDay = async () => {
    setEndDayError(null);
    setEndingDay(true);
    try {
      const { data, error } = await supabase.rpc("end_day");
      const result = Array.isArray(data) ? data[0] : data;
      if (error || !result?.success) {
        setEndDayError(error?.message || result?.message || "Couldn't end your day.");
      } else {
        await Promise.all([loadDayStart(), loadActivity()]);
      }
    } catch (err) {
      setEndDayError(err.message || "Couldn't end your day.");
    } finally {
      setEndingDay(false);
    }
  };

  const handleAddNote = async () => {
    const note = noteInput.trim();
    if (!note) return;
    setAddingNote(true);
    try {
      const { data, error } = await supabase.rpc("add_day_note", { p_note: note });
      const result = Array.isArray(data) ? data[0] : data;
      if (!error && result?.success) {
        setNoteInput("");
        await loadActivity();
      }
    } finally {
      setAddingNote(false);
    }
  };

  const handleCheckIn = async (dealer) => {
    setCheckInError(null);
    setCheckingInId(dealer.id);
    try {
      const pos = await getCurrentPosition();
      const { data, error } = await supabase.rpc("start_dealer_visit", {
        p_dealer_id: dealer.id, p_latitude: pos.latitude, p_longitude: pos.longitude,
      });
      const result = Array.isArray(data) ? data[0] : data;
      if (error || !result?.success) {
        setCheckInError(error?.message || result?.message || "Couldn't check in.");
        setCheckingInId(null);
      } else {
        await Promise.all([loadOpenVisit(), loadActivity()]);
        setCheckingInId(null);
      }
    } catch (err) {
      setCheckInError(err.message || "Couldn't check in.");
      setCheckingInId(null);
    }
  };

  const handleAddDealer = async () => {
    setAddDealerError(null);
    if (!newShopName.trim()) { setAddDealerError("Shop name is required."); return; }
    if (!newWhatsapp.trim()) { setAddDealerError("WhatsApp number is required."); return; }
    setAddingDealer(true);
    try {
      const pos = await getCurrentPosition();
      const { data, error } = await supabase.rpc("add_field_dealer", {
        p_shop_name: newShopName.trim(),
        p_owner_name: newOwnerName.trim() || null,
        p_alias_name: newAlias.trim() || null,
        p_whatsapp_number: newWhatsapp.trim(),
        p_alternate_number: newAlternate.trim() || null,
        p_address: newAddress.trim() || null,
        p_latitude: pos.latitude,
        p_longitude: pos.longitude,
      });
      const result = Array.isArray(data) ? data[0] : data;
      if (error || !result?.success) {
        setAddDealerError(error?.message || result?.message || "Couldn't add this dealer.");
      } else {
        setNewShopName(""); setNewOwnerName(""); setNewAlias(""); setNewWhatsapp(""); setNewAlternate(""); setNewAddress("");
        setDupMatches([]);
        setShowAddDealer(false);
        await loadDealers();
      }
    } catch (err) {
      setAddDealerError(err.message || "Couldn't get your location.");
    } finally {
      setAddingDealer(false);
    }
  };

  const handleCheckOut = async () => {
    setCheckOutError(null);
    if (!boardFile || !shopFile || !cardFile || !videoFile) {
      setCheckOutError("Board photo, shop photo, card photo, and a short video are all required to check out.");
      return;
    }
    setCheckingOut(true);
    try {
      const pos = await getCurrentPosition();
      // Recording itself now auto-stops at 5s (see CameraVideoSlot), so
      // this is just a safety-net check in case a device's encoder pads
      // the clip slightly beyond that.
      const duration = await getVideoDuration(videoFile);
      if (duration != null && duration > 8) {
        setCheckOutError(`That video is ${Math.round(duration)}s — please re-record it.`);
        setCheckingOut(false);
        return;
      }
      const dealerId = openVisit.dealer_id;
      const [boardUrl, shopUrl, cardUrl, videoUrl] = await Promise.all([
        uploadVisitMedia(boardFile, { folder: dealerId, kind: "board" }),
        uploadVisitMedia(shopFile, { folder: dealerId, kind: "shop" }),
        uploadVisitMedia(cardFile, { folder: dealerId, kind: "card" }),
        uploadVisitMedia(videoFile, { folder: dealerId, kind: "video" }),
      ]);
      const { data, error } = await supabase.rpc("complete_dealer_visit", {
        p_visit_id: openVisit.visit_id,
        p_latitude: pos.latitude,
        p_longitude: pos.longitude,
        p_board_photo_url: boardUrl,
        p_shop_photo_url: shopUrl,
        p_card_photo_url: cardUrl,
        p_video_url: videoUrl,
        p_notes: checkoutNotes,
      });
      const result = Array.isArray(data) ? data[0] : data;
      if (error || !result?.success) {
        setCheckOutError(error?.message || result?.message || "Couldn't check out.");
      } else {
        setBoardFile(null); setShopFile(null); setCardFile(null); setVideoFile(null); setCheckoutNotes("");
        await Promise.all([loadOpenVisit(), loadActivity()]);
      }
    } catch (err) {
      setCheckOutError(err.message || "Couldn't check out.");
    } finally {
      setCheckingOut(false);
    }
  };

  const dayEnded = !!dayStart?.ended_at;
  const dayStarted = !!dayStart;

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg, #7B2D8B 0%, #a13ea9 100%)", padding: "18px 20px 0", color: "#fff" }}>
        <button onClick={() => navigate("/staff/sales")} style={{ background: "none", border: "none", color: "#fff", opacity: 0.9, fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 12 }}>
          ← Dashboard
        </button>

        <div style={{ display: "flex", gap: 8, marginTop: 6, background: "rgba(255,255,255,0.14)", borderRadius: 12, padding: 4 }}>
          <div
            onClick={() => setActiveTab("day")}
            style={{
              flex: 1, textAlign: "center", padding: "10px 8px", borderRadius: 9, fontSize: 12.5, fontWeight: 800,
              cursor: "pointer", userSelect: "none",
              background: activeTab === "day" ? "#fff" : "transparent",
              color: activeTab === "day" ? "#7B2D8B" : "#fff",
              opacity: activeTab === "day" ? 1 : 0.75,
            }}
          >
            🛵 Day
          </div>
          <div
            onClick={() => setActiveTab("checkin")}
            style={{
              flex: 1, textAlign: "center", padding: "10px 8px", borderRadius: 9, fontSize: 12.5, fontWeight: 800,
              cursor: "pointer", userSelect: "none",
              background: activeTab === "checkin" ? "#fff" : "transparent",
              color: activeTab === "checkin" ? "#7B2D8B" : "#fff",
              opacity: activeTab === "checkin" ? 1 : 0.75,
            }}
          >
            {openVisit ? "🔴 Check Out" : "📍 Check In"}
          </div>
        </div>
        <div style={{ height: 20 }} />
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "18px 20px 60px" }}>

        {/* ============ DAY TAB ============ */}
        {activeTab === "day" && (
          <>
            {loadingDayStart ? null : !dayStarted ? (
              <div style={BOX_STYLE}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Start your day</div>
                <div style={{ fontSize: 11.5, color: "#888", lineHeight: 1.5, marginBottom: 12 }}>
                  Snap a photo of your bike/vehicle's meter reading to start your day. You can do this from anywhere — no location restriction.
                </div>
                <div style={{ maxWidth: 140, margin: "0 auto 14px" }}>
                  <CameraPhotoSlot label="Meter reading" file={meterFile} onChange={setMeterFile} disabled={starting} />
                </div>
                <button
                  onClick={handleStartDay}
                  disabled={starting}
                  style={{ width: "100%", padding: 13, border: "none", borderRadius: 10, background: starting ? "#c9a8d1" : "#7B2D8B", color: "#fff", fontSize: 14, fontWeight: 800, cursor: starting ? "default" : "pointer" }}
                >
                  {starting ? "Starting your day…" : "🛵 Confirm Start Day"}
                </button>
                {startError && <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: "#d64545" }}>{startError}</div>}
              </div>
            ) : (
              <>
                <div style={BOX_STYLE}>
                  <span style={{
                    display: "inline-block", fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "3px 10px",
                    background: dayEnded ? "#f2f2f2" : "#e6f7ec", color: dayEnded ? "#888" : "#2fa84f",
                  }}>
                    {dayEnded ? `⏹ Day ended · ${timeLabel(dayStart.ended_at)}` : `🟢 Day started · ${timeLabel(dayStart.started_at)}`}
                  </span>
                  {!dayEnded && (
                    <>
                      <button
                        onClick={handleEndDay}
                        disabled={endingDay || !!openVisit}
                        style={{
                          display: "block", width: "100%", marginTop: 12, padding: 12, borderRadius: 10,
                          background: "#fff", color: "#c94545", border: "1.5px solid #c94545", fontSize: 13.5, fontWeight: 800,
                          cursor: endingDay || !!openVisit ? "default" : "pointer", opacity: openVisit ? 0.5 : 1,
                        }}
                      >
                        {endingDay ? "Ending day…" : "🔴 End Day"}
                      </button>
                      {openVisit && <div style={{ fontSize: 11, color: "#888", marginTop: 8 }}>Check out at your current dealer before ending the day.</div>}
                      {endDayError && <div style={{ fontSize: 12, fontWeight: 600, color: "#d64545", marginTop: 8 }}>{endDayError}</div>}
                    </>
                  )}
                </div>

                <div style={BOX_STYLE}>
                  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>Day Activity</div>
                  <div style={{ fontSize: 11.5, color: "#888", lineHeight: 1.5, marginBottom: 10 }}>
                    A running log of your day — check-ins, check-outs, and anything you add yourself.
                  </div>
                  {loadingActivity ? (
                    <div style={{ fontSize: 12.5, color: "#999" }}>Loading…</div>
                  ) : activity.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: "#999" }}>Nothing logged yet today.</div>
                  ) : (
                    activity.map((a, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: i < activity.length - 1 ? "1px solid #f2e6f4" : "none" }}>
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#f3e6f6", color: "#7B2D8B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>
                          {ACTIVITY_ICON[a.kind] || "•"}
                        </div>
                        <div>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#333" }}>{a.description}</div>
                          <div style={{ fontSize: 10.5, color: "#999", marginTop: 1 }}>{timeLabel(a.occurred_at)}</div>
                          {a.note && <div style={{ fontSize: 11.5, color: "#666", marginTop: 3 }}>{a.note}</div>}
                        </div>
                      </div>
                    ))
                  )}
                  {!dayEnded && (
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <input
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        placeholder="Add a note (e.g. met distributor)…"
                        style={{ flex: 1, padding: "9px 10px", border: "1.5px solid #eadcec", borderRadius: 8, fontSize: 12 }}
                        onKeyDown={(e) => { if (e.key === "Enter") handleAddNote(); }}
                      />
                      <button
                        onClick={handleAddNote}
                        disabled={addingNote || !noteInput.trim()}
                        style={{ background: "#7B2D8B", color: "#fff", border: "none", borderRadius: 8, padding: "0 14px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                      >
                        Add
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* ============ CHECK-IN TAB ============ */}
        {activeTab === "checkin" && (
          <>
            {loadingDayStart || loadingOpenVisit ? null : dayEnded ? (
              <div style={BOX_STYLE}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Your day has ended</div>
                <div style={{ fontSize: 11.5, color: "#888", lineHeight: 1.5 }}>
                  You ended your day for today, so you can't check in anywhere else until you start a new day tomorrow.
                </div>
              </div>
            ) : !dayStarted ? (
              <div style={BOX_STYLE}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Start your day to check in</div>
                <div style={{ fontSize: 11.5, color: "#888", lineHeight: 1.5, marginBottom: 12 }}>
                  You haven't started your day yet.
                </div>
                <button
                  onClick={() => setActiveTab("day")}
                  style={{ width: "100%", padding: 11, border: "1.5px solid #7B2D8B", borderRadius: 8, background: "#fff", color: "#7B2D8B", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  🛵 Go to Start Day
                </button>
              </div>
            ) : openVisit ? (
              <>
                <LocationPermissionBanner />
                <div style={BOX_STYLE}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "3px 10px", background: "#fff4e0", color: "#c98400" }}>
                    🟢 Checked in at {openVisit.dealer_name} · since {timeLabel(openVisit.check_in_at)}
                  </span>
                  <div style={{ fontSize: 11.5, color: "#888", marginTop: 10, lineHeight: 1.5 }}>
                    Complete checkout below — board photo, shop photo, dealer card photo, and a short video, all re-checked against the same 100m geofence.
                  </div>
                </div>

                <div style={BOX_STYLE}>
                  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Checkout photos</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                    <CameraPhotoSlot label="Shop board" file={boardFile} onChange={setBoardFile} disabled={checkingOut} />
                    <CameraPhotoSlot label="Shop interior" file={shopFile} onChange={setShopFile} disabled={checkingOut} />
                    <CameraPhotoSlot label="Dealer card" file={cardFile} onChange={setCardFile} disabled={checkingOut} />
                  </div>
                  <CameraVideoSlot file={videoFile} onChange={setVideoFile} disabled={checkingOut} />
                  <textarea
                    value={checkoutNotes}
                    onChange={(e) => setCheckoutNotes(e.target.value)}
                    placeholder="Notes for this visit (optional)"
                    rows={2}
                    style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #eee", borderRadius: 8, fontSize: 13, fontFamily: "inherit", resize: "vertical", margin: "12px 0", boxSizing: "border-box" }}
                  />
                  <button
                    onClick={handleCheckOut}
                    disabled={checkingOut}
                    style={{ width: "100%", padding: 12, border: "none", borderRadius: 10, background: checkingOut ? "#c9a8d1" : "#7B2D8B", color: "#fff", fontSize: 14, fontWeight: 800, cursor: checkingOut ? "default" : "pointer" }}
                  >
                    {checkingOut ? "Checking out…" : "✅ Confirm Check Out"}
                  </button>
                  {checkOutError && <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: "#d64545" }}>{checkOutError}</div>}
                </div>
              </>
            ) : (
              <>
                <LocationPermissionBanner />

                <button
                  onClick={() => { setShowAddDealer((v) => !v); setAddDealerError(null); setDupMatches([]); }}
                  style={{ width: "100%", padding: 11, marginBottom: 12, border: "1.5px dashed #7B2D8B", borderRadius: 10, background: showAddDealer ? "#f8f0f9" : "#fff", color: "#7B2D8B", fontSize: 13, fontWeight: 800, cursor: "pointer" }}
                >
                  {showAddDealer ? "✕ Cancel" : "+ Add New Dealer"}
                </button>

                {showAddDealer && (
                  <div style={BOX_STYLE}>
                    <div style={{ fontSize: 12.5, color: "#888", lineHeight: 1.5, marginBottom: 10 }}>
                      Add a brand-new shop right now — it'll appear in your list below tagged "New" and you can check in/out immediately. Admin reviews it later; you don't have to wait.
                    </div>
                    <input
                      value={newShopName}
                      onChange={(e) => setNewShopName(e.target.value)}
                      placeholder="Shop name *"
                      style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #eadcec", borderRadius: 8, fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
                    />
                    <input
                      value={newOwnerName}
                      onChange={(e) => setNewOwnerName(e.target.value)}
                      placeholder="Owner name (optional)"
                      style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #eadcec", borderRadius: 8, fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
                    />
                    <input
                      value={newAlias}
                      onChange={(e) => setNewAlias(e.target.value)}
                      placeholder="Alias — e.g. Sharma Shahdra (optional)"
                      style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #eadcec", borderRadius: 8, fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
                    />
                    <input
                      value={newWhatsapp}
                      onChange={(e) => setNewWhatsapp(e.target.value)}
                      placeholder="WhatsApp number *"
                      inputMode="tel"
                      style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #eadcec", borderRadius: 8, fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
                    />
                    <input
                      value={newAlternate}
                      onChange={(e) => setNewAlternate(e.target.value)}
                      placeholder="Alternate number (optional)"
                      inputMode="tel"
                      style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #eadcec", borderRadius: 8, fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
                    />
                    {checkingDup && (
                      <div style={{ fontSize: 11.5, color: "#999", marginBottom: 8 }}>Checking for existing matches…</div>
                    )}
                    {!checkingDup && dupMatches.length > 0 && (
                      <div style={{ background: "#fff4e0", border: "1.5px solid #f0c470", borderRadius: 8, padding: "9px 11px", marginBottom: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#a56a00", marginBottom: 4 }}>
                          ⚠️ This number is already on file
                        </div>
                        {dupMatches.map((m, i) => (
                          <div key={i} style={{ fontSize: 11.5, color: "#8a5a00", marginBottom: 2 }}>
                            "{m.name}" ({m.matched_number}) — {m.extra}
                          </div>
                        ))}
                        <div style={{ fontSize: 11, color: "#a56a00", marginTop: 4 }}>
                          Same shop? Search for it above instead of adding again. If it's genuinely a different shop, go ahead — this is just a heads-up.
                        </div>
                      </div>
                    )}
                    <input
                      value={newAddress}
                      onChange={(e) => setNewAddress(e.target.value)}
                      placeholder="Address (optional)"
                      style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #eadcec", borderRadius: 8, fontSize: 13, marginBottom: 10, boxSizing: "border-box" }}
                    />
                    <button
                      onClick={handleAddDealer}
                      disabled={addingDealer || !newShopName.trim() || !newWhatsapp.trim()}
                      style={{ width: "100%", padding: 12, border: "none", borderRadius: 10, background: addingDealer ? "#c9a8d1" : "#7B2D8B", color: "#fff", fontSize: 13.5, fontWeight: 800, cursor: addingDealer ? "default" : "pointer" }}
                    >
                      {addingDealer ? "Adding…" : "📍 Add Dealer at My Current Location"}
                    </button>
                    {addDealerError && <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: "#d64545" }}>{addDealerError}</div>}
                  </div>
                )}

                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search your dealers…"
                  style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #7B2D8B", borderRadius: 10, fontSize: 13.5, marginBottom: 12, boxSizing: "border-box", background: "#fff" }}
                />
                {checkInError && <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 600, color: "#d64545" }}>{checkInError}</div>}
                <div style={{ fontSize: 11, color: "#7B2D8B", background: "#f8f0f9", borderRadius: 8, padding: "8px 10px", marginBottom: 14, lineHeight: 1.5, fontWeight: 600 }}>
                  📍 You must be within 100m of a dealer to check in there. Tap a dealer to confirm.
                </div>
                <div style={BOX_STYLE}>
                  {loadingDealers ? (
                    <div style={{ padding: "12px 4px", textAlign: "center", fontSize: 13, color: "#999" }}>Loading…</div>
                  ) : dealerError ? (
                    <div style={{ padding: "12px 4px", textAlign: "center", fontSize: 13, color: "#d64545" }}>Couldn't load your dealers ({dealerError}).</div>
                  ) : filteredDealers.length === 0 ? (
                    <div style={{ padding: "12px 4px", textAlign: "center", fontSize: 13, color: "#999" }}>
                      {dealers.length === 0 ? "No dealers assigned to you yet." : "No dealers match your search."}
                    </div>
                  ) : (
                    filteredDealers.map((d) => (
                      <div
                        key={d.id}
                        onClick={() => (checkingInId ? null : handleCheckIn(d))}
                        style={{
                          display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderBottom: "1px solid #f2e6f4",
                          cursor: checkingInId ? "default" : "pointer", opacity: checkingInId && checkingInId !== d.id ? 0.5 : 1,
                        }}
                      >
                        <div style={{ width: 34, height: 34, borderRadius: 9, background: "#f3e6f6", color: "#7B2D8B", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                          {initials(d.name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            {d.name || "Unnamed"}{d.alias_name ? ` (${d.alias_name})` : ""}
                            {d.dealer_kind && d.dealer_kind !== "profile" && (
                              <span style={{ fontSize: 9.5, fontWeight: 800, color: "#c98400", background: "#fff4e0", borderRadius: 999, padding: "2px 7px" }}>
                                🆕 New{d.dealer_kind === "field_pending" ? " · pending" : ""}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: "#999", marginTop: 1 }}>{d.dealer_code || "—"}</div>
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: "#7B2D8B" }}>
                          {checkingInId === d.id ? "Checking in…" : "Check in ›"}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </>
        )}

      </div>
    </div>
  );
}
