const handleLogin = async () => {
  const res = await fetch("https://your-render-url.onrender.com/api/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();

  // ✅ STORE TOKEN
  localStorage.setItem("token", data.token);

  // optional
  localStorage.setItem("user", JSON.stringify(data.user));

  // redirect
  window.location.href = "/dashboard";
};