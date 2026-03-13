The goal is to have a nicer study suite for me.

I really love taking manual notes and then terning them into markdown or latex notes.

Also I quite like anki cards.

I would love to have a backend/frontend enviromt which can have these Pages.

## Anki Card Studying

class AnkiCard(SQLModel, table=True):
**table_args** = {"extend_existing": True}
id: Optional[int] = Field(None, primary_key=True, index=True)
easiness_factor: float = Field(
default=2.5,
description="Easiness factor for the card (SM2 algorithm)",
index=True,
)
repetitions: int = Field(
default=0, description="Number of times the card has been reviewed"
)
interval: int = Field(default=0, description="Interval in days until next review")
quality: int = Field(default=0, description="Last review quality rating (0-5)")

    a_content: str = Field(description="The Content of one site")
    b_content: str = Field(description="The Content of translation/other site")
    notes: Optional[str] = Field(
        None, description="Optional notes and context or examples"
    )

    next_date: date = Field(default_factory=date.today, index=True)

    course : str -> The Course of linked to
    is_question : bool = False # True if it does not make sense to switch a and b lets say a is Name the current president?

Front END

Select a of courses (default to all, can select one or many)
Just simply go throught anki cards

## Courses

Ideally we have a top bar menu of all the current courses

Each course should have a page, I can toggle it inanctive (new semester), toggles ankis inactive hides it from most menus

On a course page I see the different lectures (folders)

and I can upload static information files to the course so a list of past exams

## Lecture Overview

I can upload pdf slides. Moreover vides and audios of various formats which audio will be extracted and transcipted and or images or code/text files.
this should be saved static, also the transcriped auto. there should be a text field where I can modify the transipred audio.

I shold be able to to click on a pdf and navigate with with my arrow bars on nmy keybord -> next slide last slide
I would love to have a pdf optionally on the left the right part of the screen a markdown editor where i write markdown (should represented it ints orinigal)
text format (dont render stuff like # ss)

I would also to have my own chatbot when I scroll down, which I can either ask things about the slides
I can choose wehter I want my current slide and just want to clarify something, or I can even select all the other availabel resourses
(transcipted audois, full pdf slides, images) with a box menu. The chatbot can as an action update my notes on that particular day or action 2 is generate anki cards for me. I think I should also be able to browse other notes/lectures as context

And my most improtant feature is that I can upload slides from my phone/computer, crop them and ocr them (last time I just used gemini with an high image resolution)
that worked fine -> tell my model in the chat what it should include. What would be nice to have something like vscode/cursor where I can render the propsed edits green or something (How should the edits look like?? Basemodel, line, delete or insertion content?) how do the code editors do that

My capability:
Writing Fastapi/Pydantic/SQL/LLM/AGENT interfaces is something I am quite good at. But I never have unsertood nor done frontend. Would need to vibeocde it.
We dont need to care about security sessions and so on, one user home netwrok safteiy is given.

The difficult part is before to design the API and database layout.

For the API something I COULD come up with is

get /ankicards/list-due -> returns all due anki cards
get /ankicards/list-all -> return all anki cards
update /ankicards/id -> update/edit certain anki card -> (we just were righjt or wrong)
delete or edit anki cards
post new anki cards

the sql is the pydanitc sql model above and is stratightforwad

For the courses will be much more dififcult

should be
get /list-courses returns all alvailabe course names and status -> we print the active ones in the top bar
add /create-new course

Edit course -> toigle teh activity

Then for resources it getes really hard to design
We should store them in a simple file structure I would advocate this:

```
CourseA/
    Overview.md (Simple main md lining me to all stuuf)
    Glossary.md - per course simple editable glossary
    Lectures
        FourierTransform
            summary.md
                Files
                    auiod23132.mp3
                    slides.pdf

    StaticFiles
        LastYearsExam.pdf
```

Like that I shouodl be avle to open a coruse as a obsidianvault shouldb I?

Then the queston becomes for the files should we also add an additional sturicre?
Atleast for the audio files/vide we short flag wehter it has been transcripted before and the text, maybe a simple sql thing could be need
of file name, transcripted_text : None | str

Then the Chatbot should be

Chat ID (UUID)

include images and pdf -> we will have an chatbot api schema that either transcriped the pdfs to txt or in the case of gemini and many otehrs can take pdfs manually

REsponse should be

LLMResponse:
display_text : str | None
action : NewAnkiCards | SummaryEdit | ReadFile

NewAnkiCards
-> list{{a:side, b:side}}

SUmmaryEdit
maybe <<<<<<< SEARCH
def old_function():
print("hello")
=======
def new_function():
print("hello world")

> > > > > > > REPLACE
> > > > > > > or simple insert

If asked get the other possivle files/lectures and so on

Then the real difficulty will be the fronend

## Top Bar

```
------------------------------------------------------------------------------------------------
AnkiCards | Project A | Projcet B | New Projcets | Hidden Projects
------------------------------------------------------------------------------------------------
```

Anki Card front END SHould be rather simple
CHoose the typo active projcets to be included by boxes or something nice

### Project Overview / crate procjtes

I am really unsure
We would need to be able to uplpad files -> this should probably be sepeate
So jsut a button to upload what ever, select wether its static or for a given lecture
also option to creat/edit/delete lectures

Then when double clikcing on a file -> we should be able to open/ play/edit it.

### Lecture Mode

This is byfar the hardest thing.
We should be able to select a PDF or Image or Transcipt or audio or so on
Should open on full page. we can naviate pdf slides and serach and so on. like with vscode with command b, we can toggle
the summary.md editor from the right side, perdeufal 50% of the page but can be dragged left or write

so its

```
------------------------------------------------------------------------------------------------
AnkiCards | Project A | Projcet B | New Projcets | Hidden Projects
------------------------------------------------------------------------------------------------
Project A - Lecture B

Resources on Top, we can click on

1.pdf (selected), 2.audio

------------------------------------------------------------------------------------------------
PDF SLIDE 1






                                                                arrow to move right or left
------------------------------------------------------------------------------------------------


or

------------------------------------------------------------------------------------------------
AnkiCards | Project A | Projcet B | New Projcets | Hidden Projects
------------------------------------------------------------------------------------------------
Project A - Lecture B

Resources on Top, we can click on

1.pdf , 2.audio (selectre)

------------------------------------------------------------------------------------------------
Audio Player
Transcribe BUtton (if nto done)

Transscirobed text field




Save button
------------------------------------------------------------------------------------------------




then with commnd b


------------------------------------------------------------------------------------------------
AnkiCards | Project A | Projcet B | New Projcets | Hidden Projects
------------------------------------------------------------------------------------------------
Project A - Lecture B

Resources on Top, we can click on

1.pdf , 2.audio (selectre)

------------------------------------------------------------------------------------------------
Audio Player                                        Editable Summary.md
Transcribe BUtton (if nto done)
                                                |
Transscirobed text field
                                                |
                                                |
                                                |
                                                |
Save button
------------------------------------------------------------------------------------------------



Also impartnanlty with command S -> we save!!


Below that all we have the chate interface always ready


Resource Selcetion Menu
-> Can Selcet the pds/audio from this or other lecture and or static file
-> Action Menu -> list of possible actions (Default all allowed but we can selcet for example only createankis)

------------------------------------------------------------------------------------------------

Chatbot Message:


                                                        MY Message:


Chatbot Message:





Clear Button -> Clear Converaiotn



Then When there is a summary edit -> its run green, we can accpemnt, remove and or edit

```
