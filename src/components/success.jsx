export default function Success({ message }) {

    return (
        <div className="min-w-[50%] max-w-[80%] px-10 text-Dark text-center flex items-center justify-center bg-Success mt-2 rounded-lg">
            <h2 className="font-bold text-lg">{message}</h2>
        </div>
    )
}