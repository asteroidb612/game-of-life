port module Main exposing (main)

import Html exposing (..)
import Html.Events exposing (..)


main : Program Never Model Msg
main =
    program
        { init = init ! []
        , subscriptions = \_ -> Sub.none
        , update = update
        , view = view
        }


port toJs : String -> Cmd msg


type Msg
    = EnqueueMultiplayerGame
    | ChangeName String


type alias Model =
    String


init : Model
init =
    "Default"


update : Msg -> String -> ( String, Cmd msg )
update msg model =
    case msg of
        EnqueueMultiplayerGame ->
            model ! [ toJs model ]

        ChangeName name ->
            (if name == "" then
                "Default"
             else
                name
            )
                ! []


view : String -> Html Msg
view name =
    div []
        [ div [] [ input [ onInput ChangeName ] [ text name ] ]
        , div []
            [ button [ onClick EnqueueMultiplayerGame ]
                [ text <| "Play Against Others As " ++ name ]
            ]
        ]
