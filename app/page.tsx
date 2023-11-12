"use client";

import {useMemo} from "react";
import {useChat} from "ai/react";

type DataType = {
    context: any[];
};

export default function Chat() {
    const {messages, data, input, handleInputChange, handleSubmit, append, setMessages} = useChat();

    const parsedData = useMemo<DataType[]>(
        () => data?.flatMap((x: string) => [null, JSON.parse(x)]),
        [data]
    );

    const handleLanguage = (e: MouseEventHandler<HTMLButtonElement>) => {
        const buttonWrappers = Array.from(document.getElementsByClassName('languageSelection'))
        buttonWrappers[0].classList.add('hidden');

        setMessages(
            [
                {id: '', role: 'assistant', content: 'What is your preferred lanauge?'},
                {id: '', role: 'user', content: e.target.textContent}
            ]
        )
    }

    return (
        <div className="mx-auto w-full max-w-md py-24 flex flex-col stretch">
            {messages.length > 0
                ? messages.map((m, i) => (
                    <div key={m.id} className="flex flex-col mb-6">
                        <b>{m.role === "user" ? "User: " : "AI: "}</b>

                        <small className="text-gray-500">
                            {parsedData?.[i]?.context
                                ?.map(({payload}) => payload.article)
                                .join(", ")}
                        </small>

                        <p className="whitespace-pre-wrap">{m.content.trim()}</p>
                    </div>
                ))
                : null}

            <form onSubmit={handleSubmit}>
                <div className='languageSelection'>
                    <p>What is your preferred language?</p>
                    <div className="block flex space-x-4 ">
                        <button
                            className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 border border-red-700 rounded"
                            onClick={handleLanguage} data-language="English">English
                        </button>
                        <button
                            className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 border border-red-700 rounded"
                            onClick={handleLanguage} data-language="Deutsch">Deutsch
                        </button>
                        <button
                            className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 border border-red-700 rounded"
                            onClick={handleLanguage} data-language="Français">Français
                        </button>
                    </div>
                </div>
                <input
                    className="fixed w-full max-w-md bottom-0 border border-gray-300 rounded mb-8 shadow-xl p-2"
                    value={input}
                    placeholder="Say something..."
                    onChange={handleInputChange}
                />
            </form>
        </div>
    );
}
