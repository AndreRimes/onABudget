export default function Overlay({ children, setIsModalOpen }) {

    function handleClick() {
        if (setIsModalOpen) {
            setIsModalOpen(false)
        }
    }

    return (
        <div onClick={handleClick} className="fixed top-0 left-0 h-full w-full bg-black/70 flex items-center justify-center z-10">
            {children}
        </div>
    );
}
