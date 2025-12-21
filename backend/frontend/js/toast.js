export function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-xl text-white ${isError ? 'bg-red-600' : 'bg-gray-800'} transition-opacity duration-300 z-50 font-medium`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.style.transform = 'translateY(10px)';
        toast.style.opacity = '0';
        requestAnimationFrame(() => {
            toast.style.transition = 'all 0.3s ease';
            toast.style.transform = 'translateY(0)';
            toast.style.opacity = '1';
        });
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
