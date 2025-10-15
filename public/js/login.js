document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const errorMessage = document.getElementById("errorMessage");

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const username = document.getElementById("username").value.trim();
      const password = document.getElementById("password").value.trim();
      errorMessage.textContent = "";
      errorMessage.classList.remove('visible');

      try {
        const response = await fetch("/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ username, password }),
        });

        if (response.ok) {
          // Se o servidor responder "OK", redireciona para o dashboard
          window.location.href = "/dashboard";
        } else {
          // Se o servidor responder com erro, mostra a mensagem
          const data = await response.json();
          errorMessage.textContent = data.message || "Utilizador ou senha inválidos.";
          errorMessage.classList.add('visible');
        }
      } catch (error) {
        console.error("Erro ao tentar fazer login:", error);
        errorMessage.textContent = "Ocorreu um erro de conexão. Tente novamente.";
        errorMessage.classList.add('visible');
      }
    });
  }
});