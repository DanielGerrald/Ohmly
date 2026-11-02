/**
 * Text input with built-in validation and emoji filtering, used by every
 * form in the app.
 */

import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import Colors from "../../constants/colors";

/**
 * A TextInput that validates itself based on its `label` and shows an error
 * message above the field.
 *
 * How it works:
 * - Every keystroke strips emojis. If any were removed, "Emojis are not
 *   allowed" is shown for 3 seconds before normal validation resumes.
 * - After each change and when the field loses focus, the value is checked
 *   by validateInput (required fields, email/phone/name formats, ...).
 * - Setting `forceValidate` to true (e.g. when a form is submitted) makes
 *   the field validate and show its error even if the user never touched it.
 * Note: the error message is only displayed; it does not stop the parent
 * form from submitting. Parents do their own checks.
 *
 * @param {Object} props
 * @param {string} props.label - field key; also selects the validation rule
 * @param {string} props.value - current text
 * @param {(text: string) => void} props.onChangeText - receives cleaned text
 * @param {boolean} [props.required=false] - show an error when empty
 * @param {boolean} [props.forceValidate=false] - validate immediately
 * @param {Object} [props.style] - input style
 * Other props (placeholder, secureTextEntry, autoComplete, keyboardType,
 * multiline, textContentType) are passed straight to TextInput.
 */
const CustomInput = ({
  style,
  label,
  placeholder,
  secureTextEntry,
  autoComplete,
  keyboardType,
  multiline,
  onChangeText,
  value,
  required = false,
  forceValidate = false,
  textContentType,
}) => {
  const [error, setError] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  /**
   * Runs validateInput on the current value and shows/clears the error.
   */
  const validate = () => {
    const errorMessage = validateInput(value);
    if (errorMessage) {
      setError(true);
      setErrorMsg(errorMessage);
    } else {
      setError(false);
      setErrorMsg("");
    }
  };

  useEffect(() => {
    if (forceValidate) validate();
  }, [forceValidate]);

  /**
   * Validates the field when it loses focus.
   */
  const handleBlurValidate = () => {
    const errorMessage = validateInput(value);
    if (errorMessage) {
      setError(true);
      setErrorMsg(errorMessage);
    } else {
      setError(false);
      setErrorMsg("");
    }
  };

  /**
   * Timer used to hide the "Emojis are not allowed" message after 3 seconds.
   */
  const emojiTimeoutRef = useRef(null);

  /**
   * Removes emoji and common pictograph/symbol characters from a string.
   *
   * @param {string} text
   * @returns {string} text without emojis
   */
  const removeEmojis = (text) => {
    const emojiRegex =
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{3030}\u{FE0F}\u{00A9}\u{00AE}\u{203C}\u{2049}\u{2122}\u{2139}\u{2194}\u{21A9}\u{21AA}\u{231A}-\u{231B}\u{2328}-\u{2329}\u{25AA}\u{25AB}\u{25FE}\u{2B06}\u{2194}\u{2195}\u{21A9}\u{21AA}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B06}\u{2934}\u{2935}\u{25AA}\u{25AB}]/gu;
    return text.replace(emojiRegex, "");
  };

  /**
   * Runs on every keystroke: strips emojis, passes the cleaned text to the
   * parent and updates the error message.
   *
   * @param {string} text - raw text from the TextInput
   */
  const handleChangeText = (text) => {
    const cleanedText = removeEmojis(text);

    if (cleanedText !== text) {
      setError(true);
      setErrorMsg("Emojis are not allowed");

      if (emojiTimeoutRef.current) {
        clearTimeout(emojiTimeoutRef.current);
      }

      emojiTimeoutRef.current = setTimeout(() => {
        const errorMessage = validateInput(cleanedText);
        if (errorMessage) {
          setError(true);
          setErrorMsg(errorMessage);
        } else {
          setError(false);
          setErrorMsg("");
        }
      }, 3000);

      onChangeText(cleanedText);
      return;
    }

    onChangeText(cleanedText);

    const errorMessage = validateInput(cleanedText);
    if (errorMessage) {
      setError(true);
      setErrorMsg(errorMessage);
    } else {
      setError(false);
      setErrorMsg("");
    }
  };

  /**
   * Returns an error message for the given text, or "" if it's valid.
   *
   * Rules:
   * - If `required` and empty: a field-specific "... is required" message.
   * - username / password: must not be empty.
   * - email: must look like something@domain.tld.
   * - phone_nbr: US-style 10-digit number, optional +, (), -, space or dots.
   * - first_name / last_name: letters (incl. accented), hyphens, apostrophes
   *   and single spaces between words.
   *
   * @param {string} text
   * @returns {string}
   */
  const validateInput = (text) => {
    if (required && !text) {
      switch (label) {
        case "desc_service_perf":
          return "Description of service performed is required";
        case "desc_material_inst":
          return "Description of materials installed is required";
        case "walkthrough":
          return "Final Walkthrough is required.";
        case "desc_return_needed":
          return "Reason for return needed is required";
        case "manager_name":
          return "The on-site manager's name is required";
        default:
          return `${label} is required`;
      }
    }

    switch (label) {
      case "username":
        if (!text) return "Please enter your username";
        break;
      case "password":
        if (!text) return "Please enter your password";
        break;
      case "email":
        const emailRegex = /\S+@\S+\.\S+/;
        if (!emailRegex.test(text)) return "Please enter a valid email address";
        break;
      case "phone_nbr":
        const phoneRegex =
          /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,5}$/im;
        if (!phoneRegex.test(text)) return "Please enter a valid phone number";
        break;
      case "first_name":
      case "last_name":
        const nameRegex = /^[a-zA-ZÀ-ÿ-']+( [a-zA-ZÀ-ÿ-']+)*$/;
        if (!nameRegex.test(text)) return `Please enter a valid ${label}`;
        break;
    }

    return "";
  };

  return (
    <View>
      {error && <Text style={styles.valMessageText}>{errorMsg}</Text>}
      <TextInput
        label={label}
        style={style}
        placeholder={placeholder}
        placeholderTextColor={"black"}
        secureTextEntry={secureTextEntry}
        autoComplete={autoComplete}
        keyboardType={keyboardType}
        multiline={multiline}
        value={value}
        onChangeText={handleChangeText}
        onBlur={handleBlurValidate}
        accessibilityLabel={label}
        textContentType={textContentType}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  valMessageText: {
    color: Colors.error,
  },
});

export default CustomInput;
