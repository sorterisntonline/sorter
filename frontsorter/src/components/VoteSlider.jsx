function VoteSlider({ value, onChange, disabled }) {
    return (
        <div className="w-full max-w-lg px-4 pt-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Strongly Left</span>
                <span>Neutral</span>
                <span>Strongly Right</span>
            </div>
            <input
                id="slider"
                type="range"
                min="-50"
                max="50"
                step="1"
                value={value}
                onChange={onChange}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-500"
                disabled={disabled}
            />
        </div>
    );
}

export default VoteSlider;